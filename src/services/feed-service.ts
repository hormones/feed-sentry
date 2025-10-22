import browser from 'webextension-polyfill';
import {db, Entry, Feed} from './db';
import {requestFeed, validateFeedUrl} from './http-client';
import { hasFeedHostPermission } from './permission-service';
import {FEED_LIMITS, MessageType, NOTIFICATION_PRIORITY, RSS_POLLER, UI} from '@/constants';
import { t } from '@/i18n';

interface NotificationEntryDetail {
  id: string;
  title: string;
  link?: string | null;
  matchedKeywords: string[];
}

type NotificationTarget =
  | {
      mode: 'single';
      feedId: string;
      entryLink?: string | null;
      useKeywordFilter: boolean;
    }
  | {
      mode: 'multiple';
      feedId: string;
      useKeywordFilter: boolean;
    };

const notificationTargets = new Map<string, NotificationTarget>();
let notificationHandlersRegistered = false;

type FeedUpdateAction = 'created' | 'updated' | 'deleted';

interface FeedUpdatedMessagePayload {
  feedId: string;
  action: FeedUpdateAction;
  requiresRestart?: boolean;
}

function getFeedDisplayTitle(feed: Feed): string {
  return (feed.title ?? '').trim() || 'Feed Sentry';
}

function getEntryDisplayTitle(entry: NotificationEntryDetail, fallback: string): string {
  return (entry.title ?? '').trim() || fallback;
}

function buildOptionsUrl(feedId: string, useKeywordFilter: boolean): string {
  const optionsUrl = new URL(browser.runtime.getURL('options.html'));
  optionsUrl.searchParams.set('view', 'rss');
  optionsUrl.searchParams.set('feedId', feedId);
  if (useKeywordFilter) {
    optionsUrl.searchParams.set('keywordFilter', '1');
  }
  return optionsUrl.toString();
}

async function handleNotificationClick(notificationId: string): Promise<void> {
  const target = notificationTargets.get(notificationId);
  if (!target) {
    return;
  }

  notificationTargets.delete(notificationId);

  try {
    if (target.mode === 'single' && target.entryLink) {
      await browser.tabs.create({ url: target.entryLink });
      return;
    }

    await browser.tabs.create({
      url: buildOptionsUrl(target.feedId, target.useKeywordFilter),
    });
  } catch (error) {
    console.error('[Feed Service] Notification click handling error:', target, error);
  } finally {
    try {
      await browser.notifications.clear(notificationId);
    } catch (clearError) {
      console.warn('[Feed Service] Failed to clear notification:', notificationId, clearError);
    }
  }
}

function handleNotificationClosed(notificationId: string): void {
  if (notificationTargets.has(notificationId)) {
    notificationTargets.delete(notificationId);
  }
}

function ensureNotificationHandlers(): void {
  if (notificationHandlersRegistered) {
    return;
  }

  browser.notifications.onClicked.addListener(handleNotificationClick);
  browser.notifications.onClosed.addListener(handleNotificationClosed);
  notificationHandlersRegistered = true;
}

function isReceivingEndMissing(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Receiving end does not exist');
}

async function emitFeedUpdated(payload: FeedUpdatedMessagePayload): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: MessageType.FEED_UPDATED,
      payload,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (isReceivingEndMissing(error)) {
      return;
    }
    console.error('[Feed Service] Broadcast feed update error:', error);
    throw error;
  }
}

function shouldRestartPollerForUpdates(updates: Partial<Feed>, current: Feed): boolean {
  if ('pollInterval' in updates && typeof updates.pollInterval === 'number') {
    if (updates.pollInterval !== current.pollInterval) {
      return true;
    }
  }
  if ('status' in updates && typeof updates.status === 'boolean') {
    if (updates.status !== current.status) {
      return true;
    }
  }
  return false;
}

// Pagination result
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Query options
export interface QueryOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isRead?: boolean;
  keywordFilterEnabled?: boolean;
  keywordFilterMap?: Record<string, string[]>;
}

export function formatBadgeText(count?: number): string {
  if (!count || count <= 0) {
    return '';
  }

  const maxDisplay = UI.BADGE_MAX_DISPLAY;
  return count > maxDisplay ? `${maxDisplay}+` : String(count);
}

async function broadcastEntryReadChanged(feedId?: string | 'all'): Promise<void> {
  let unreadCount: number | undefined;
  try {
    const totalUnread = await getUnreadCount('all', { activeOnly: true });
    unreadCount = totalUnread;
    const badgeText = formatBadgeText(totalUnread);
    await browser.action.setBadgeText({ text: badgeText });
    if (totalUnread > 0) {
      await browser.action.setBadgeBackgroundColor({ color: UI.BADGE_COLOR });
    }
  } catch (error) {
    console.error('[Feed Service] Update badge locally error:', error);
  }

  const payload = {
    feedId: feedId ?? null,
    count: unreadCount,
  };

  try {
    await browser.runtime.sendMessage({
      type: MessageType.BADGE_UPDATE,
      payload,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('Receiving end does not exist'))) {
      console.error('[Feed Service] Broadcast badge update error:', error);
    }
  }

  try {
    await browser.runtime.sendMessage({
      type: MessageType.ENTRY_READ_CHANGED,
      payload,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      return;
    }
    console.error('[Feed Service] Broadcast entry read change error:', error);
  }
}

/**
 * Generate feed ID from URL using hash
 */
export function generateFeedId(url: string): string {
  // Simple hash function for URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate entry ID from feed ID and entry GUID
 */
export function generateEntryId(feedId: string, guid: string): string {
  return `${feedId}_${guid}`;
}

// ==================== Feed CRUD Operations ====================

/**
 * Add new feed subscription
 */
export async function addFeed(feedData: {
  link: string;
  title?: string;
  pollInterval?: number;
  notify?: boolean;
  keywords?: string[];
  keywordNotify?: boolean;
}): Promise<Feed> {
  if (!validateFeedUrl(feedData.link)) {
    throw new Error('Invalid feed URL');
  }

  const feedId = generateFeedId(feedData.link);

  // Check if feed already exists
  const existing = await db.feeds.get(feedId);
  if (existing) {
    throw new Error('Feed already exists');
  }

  const hasPermission = await hasFeedHostPermission(feedData.link);
  if (!hasPermission) {
    throw new Error('Host permission required');
  }

  // Fetch feed to validate and get title
  const result = await requestFeed(feedData.link);
  if (!result.success) {
    throw new Error(`Failed to fetch feed: ${result.error}`);
  }

  const timestamp = Date.now();
  const feed: Feed = {
    id: feedId,
    title: feedData.title || result.data?.title || 'Untitled Feed',
    link: feedData.link,
    pollInterval: feedData.pollInterval || 600,
    notify: feedData.notify ?? false,
    keywords: feedData.keywords || [],
    keywordNotify: feedData.keywordNotify ?? false,
    status: true,
    failureCount: 0,
    createTime: timestamp,
    updateTime: timestamp,
  };

  await db.feeds.add(feed);
  console.log('[Feed Service] Added feed:', feed.id);

  try {
    await emitFeedUpdated({
      feedId,
      action: 'created',
      requiresRestart: true,
    });
  } catch (error) {
    await db.feeds.delete(feedId);
    console.warn('[Feed Service] New feed reverted due to broadcast failure:', feedId);
    throw error;
  }

  return feed;
}

/**
 * Update existing feed
 */
export async function updateFeed(feedId: string, updates: Partial<Feed>): Promise<void> {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  // Don't allow changing id, link, createTime, updateTime externally
  const { id, link, createTime, updateTime: _ignoredUpdateTime, ...allowedUpdates } = updates;
  const requiresRestart = shouldRestartPollerForUpdates(allowedUpdates, feed);

  const previousSnapshot: Feed = { ...feed };

  await db.feeds.update(feedId, {
    ...allowedUpdates,
    updateTime: Date.now(),
  });
  console.log('[Feed Service] Updated feed:', feedId);

  try {
    await emitFeedUpdated({
      feedId,
      action: 'updated',
      requiresRestart,
    });
  } catch (error) {
    await db.feeds.put(previousSnapshot);
    console.warn('[Feed Service] Feed update reverted due to broadcast failure:', feedId);
    throw error;
  }
}

/**
 * Delete feed and its entries
 */
export async function deleteFeed(feedId: string): Promise<void> {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    return;
  }
  const relatedEntries = await db.entries.where('feedId').equals(feedId).toArray();

  await db.transaction('rw', [db.feeds, db.entries], async () => {
    await db.feeds.delete(feedId);
    await db.entries.where('feedId').equals(feedId).delete();
  });
  console.log('[Feed Service] Deleted feed and entries:', feedId);

  try {
    await emitFeedUpdated({
      feedId,
      action: 'deleted',
      requiresRestart: true,
    });
  } catch (error) {
    await db.transaction('rw', [db.feeds, db.entries], async () => {
      await db.feeds.put(feed);
      if (relatedEntries.length > 0) {
        await db.entries.bulkAdd(relatedEntries);
      }
    });
    console.warn('[Feed Service] Feed deletion reverted due to broadcast failure:', feedId);
    throw error;
  }
}

/**
 * Get feed by ID
 */
export async function getFeed(feedId: string): Promise<Feed | undefined> {
  return await db.feeds.get(feedId);
}

/**
 * Get all feeds
 */
export async function getAllFeeds(options?: { activeOnly?: boolean }): Promise<Feed[]> {
  if (options?.activeOnly) {
    const allFeeds = await db.feeds.toArray();
    return allFeeds.filter(feed => feed.status).sort((a, b) => a.createTime - b.createTime);
  }

  return await db.feeds.orderBy('createTime').toArray();
}

/**
 * Search feeds by title
 */
export async function searchFeeds(keyword: string): Promise<Feed[]> {
  const allFeeds = await db.feeds.toArray();
  const lowerKeyword = keyword.toLowerCase();

  return allFeeds.filter(feed =>
    feed.title.toLowerCase().includes(lowerKeyword)
  );
}

// ==================== Entry Operations ====================

function matchKeywords(entryTitle: string, keywords: string[]): string[] {
  if (!entryTitle) {
    return [];
  }

  const lowerTitle = entryTitle.toLowerCase();
  const matched: string[] = [];

  for (const keyword of keywords) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }

  return matched;
}

function buildGeneralSummary(count: number): string {
  const summary = t('background.feedService.feedUpdateSummary', { count });
  const trimmed = (summary ?? '').trim();
  return trimmed || `RSS subscription updated with ${count} new items. Click to view!`;
}

function buildCombinedSummary(total: number, matched: number): string {
  const summary = t('background.feedService.combinedSummary', { total, matched });
  const trimmed = (summary ?? '').trim();
  return trimmed || `RSS subscription updated with ${total} new items, ${matched} matched keywords. Click to view!`;
}

interface NotificationDisplayPayload {
  feed: Feed;
  title: string;
  message: string;
  target: NotificationTarget;
  logContext: string;
}

async function showFeedNotification(payload: NotificationDisplayPayload): Promise<void> {
  try {
    const notificationId = await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icon/icon128.png'),
      title: payload.title,
      message: payload.message,
      priority: NOTIFICATION_PRIORITY.NORMAL,
    });

    notificationTargets.set(notificationId, payload.target);
    ensureNotificationHandlers();

    console.log(
      `[Feed Service] Notification shown (${payload.logContext}):`,
      payload.feed.title,
      payload.message,
    );
  } catch (error) {
    console.error(`[Feed Service] Notification error (${payload.logContext}):`, error);
  }
}

async function maybeSendFeedNotification(
  feed: Feed,
  entries: NotificationEntryDetail[],
  keywordNotifyEnabled: boolean,
): Promise<void> {
  const notifyEnabled = feed.notify;
  const keywordEnabled = keywordNotifyEnabled;

  if (!notifyEnabled && !keywordEnabled) {
    return;
  }

  const totalCount = entries.length;
  const matchedEntries = keywordEnabled
    ? entries.filter(entry => entry.matchedKeywords.length > 0)
    : [];
  const matchedCount = matchedEntries.length;
  const feedDisplayTitle = getFeedDisplayTitle(feed);

  if (!notifyEnabled && keywordEnabled) {
    if (matchedCount === 0) {
      return;
    }

    if (matchedCount === 1) {
      const entry = matchedEntries[0];
      await showFeedNotification({
        feed,
        title: getEntryDisplayTitle(entry, feedDisplayTitle),
        message: feedDisplayTitle,
        target: {
          mode: 'single',
          feedId: feed.id,
          entryLink: entry.link ?? null,
          useKeywordFilter: false,
        },
        logContext: 'keyword-single',
      });
      return;
    }

    await showFeedNotification({
      feed,
      title: feedDisplayTitle,
      message: buildCombinedSummary(totalCount, matchedCount),
      target: {
        mode: 'multiple',
        feedId: feed.id,
        useKeywordFilter: false,
      },
      logContext: 'keyword-multiple',
    });
    return;
  }

  if (notifyEnabled && !keywordEnabled) {
    if (totalCount === 0) {
      return;
    }

    if (totalCount === 1) {
      const entry = entries[0];
      await showFeedNotification({
        feed,
        title: getEntryDisplayTitle(entry, feedDisplayTitle),
        message: feedDisplayTitle,
        target: {
          mode: 'single',
          feedId: feed.id,
          entryLink: entry.link ?? null,
          useKeywordFilter: false,
        },
        logContext: 'feed-single',
      });
      return;
    }

    await showFeedNotification({
      feed,
      title: feedDisplayTitle,
      message: buildGeneralSummary(totalCount),
      target: {
        mode: 'multiple',
        feedId: feed.id,
        useKeywordFilter: false,
      },
      logContext: 'feed-multiple',
    });
    return;
  }

  // Both notifications enabled
  if (totalCount === 0) {
    return;
  }

  if (totalCount === 1) {
    const entry = entries[0];
    await showFeedNotification({
      feed,
      title: getEntryDisplayTitle(entry, feedDisplayTitle),
      message: feedDisplayTitle,
      target: {
        mode: 'single',
        feedId: feed.id,
        entryLink: entry.link ?? null,
        useKeywordFilter: false,
      },
      logContext: 'combined-single',
    });
    return;
  }

  if (matchedCount === 0) {
    await showFeedNotification({
      feed,
      title: feedDisplayTitle,
      message: buildGeneralSummary(totalCount),
      target: {
        mode: 'multiple',
        feedId: feed.id,
        useKeywordFilter: false,
      },
      logContext: 'combined-multiple-no-keyword',
    });
    return;
  }

  await showFeedNotification({
    feed,
    title: feedDisplayTitle,
    message: buildCombinedSummary(totalCount, matchedCount),
    target: {
      mode: 'multiple',
      feedId: feed.id,
      useKeywordFilter: false,
    },
    logContext: 'combined-multiple-keyword',
  });
}

/**
 * Add entries from feed fetch result
 */
function resolveEntryIdentifier(item: {
  id?: string;
  guid?: string;
  link?: string;
}): string | undefined {
  const identifierCandidates = [item.id, item.guid, item.link];
  for (const candidate of identifierCandidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function resolveEntryTimestamp(item: { isoDate?: string; pubDate?: string }): number {
  const parseTimestamp = (value?: string): number => {
    if (!value) {
      return NaN;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const isoTimestamp = parseTimestamp(item.isoDate);
  if (Number.isFinite(isoTimestamp)) {
    return isoTimestamp;
  }

  const pubTimestamp = parseTimestamp(item.pubDate);
  if (Number.isFinite(pubTimestamp)) {
    return pubTimestamp;
  }

  return Date.now();
}

export async function addEntries(feedId: string, items: Array<{
  id?: string;
  guid?: string;
  title?: string;
  author?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
}>): Promise<{ added: number; skipped: number }> {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  let added = 0;
  let skipped = 0;
  const feedKeywords = feed.keywords || [];
  const keywordNotifyEnabled = feed.keywordNotify && feedKeywords.length > 0;
  const notificationEntries: NotificationEntryDetail[] = [];

  await db.transaction('rw', db.entries, async () => {
    for (const item of items) {
      const identifier = resolveEntryIdentifier(item);
      if (!identifier) {
        skipped++;
        continue;
      }

      const entryId = generateEntryId(feedId, identifier);

      // Check if entry already exists
      const exists = await db.entries.get(entryId);
      if (exists) {
        skipped++;
        continue;
      }

      const entry: Entry = {
        id: entryId,
        feedId,
        title: item.title || 'Untitled',
        author: item.author,
        link: item.link,
        pubDate: item.pubDate,
        createTime: resolveEntryTimestamp(item),
        isRead: false,
      };

      await db.entries.add(entry);
      added++;

      const matchedKeywords = keywordNotifyEnabled
        ? matchKeywords(entry.title, feedKeywords)
        : [];

      notificationEntries.push({
        id: entryId,
        title: entry.title,
        link: entry.link ?? null,
        matchedKeywords,
      });
    }
  });

  // Clean up old entries if exceeds limit
  await cleanupOldEntries(feedId);

  console.log(`[Feed Service] Added ${added} entries, skipped ${skipped} for feed:`, feedId);

  await maybeSendFeedNotification(feed, notificationEntries, keywordNotifyEnabled);

  return { added, skipped };
}

/**
 * Cleanup old entries for a feed (keep max 2000)
 */
async function cleanupOldEntries(feedId: string): Promise<void> {
  const count = await db.entries.where('feedId').equals(feedId).count();

  if (count > FEED_LIMITS.MAX_ENTRIES_PER_FEED) {
    const toDelete = count - FEED_LIMITS.MAX_ENTRIES_PER_FEED + FEED_LIMITS.ENTRIES_TO_DELETE;
    const oldEntries = await db.entries
      .where('feedId')
      .equals(feedId)
      .sortBy('createTime');

    const idsToDelete = oldEntries.slice(0, toDelete).map(e => e.id);
    await db.entries.bulkDelete(idsToDelete);

    console.log(`[Feed Service] Cleaned up ${idsToDelete.length} old entries for feed:`, feedId);
  }
}

/**
 * Query entries with pagination
 */
export async function queryEntries(
  feedId: string | 'all',
  options: QueryOptions = {}
): Promise<PaginatedResult<Entry>> {
  const { page = 1, pageSize = 50, keyword, isRead } = options;
  const offset = (page - 1) * pageSize;

  let collection = feedId === 'all'
    ? db.entries.toCollection()
    : db.entries.where('feedId').equals(feedId);

  // Get all data first, then filter in memory
  let allData = await collection.toArray();

  // Filter by read status
  if (isRead !== undefined) {
    allData = allData.filter(entry => entry.isRead === isRead);
  }

  // Filter by keyword
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();
    allData = allData.filter(entry =>
      entry.title.toLowerCase().includes(lowerKeyword) ||
      (entry.author && entry.author.toLowerCase().includes(lowerKeyword))
    );
  }

  if (options.keywordFilterEnabled) {
    const keywordMap = options.keywordFilterMap ?? {};
    allData = allData.filter(entry => {
      const keywords = keywordMap[entry.feedId] ?? [];
      if (!keywords.length) {
        return false;
      }
      const matchedKeywords = matchKeywords(entry.title ?? '', keywords);
      if (matchedKeywords.length > 0) {
        entry.keywords = matchedKeywords;
        return true;
      }
      return false;
    });
  }

  // Sort by createTime descending
  allData.sort((a, b) => b.createTime - a.createTime);

  // Get total count
  const total = allData.length;

  // Get paginated data
  const pageEntries = allData.slice(offset, offset + pageSize);
  const data = await attachFavoriteMetadata(pageEntries);

  return {
    data,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  };
}

/**
 * Query entries for waterfall/infinite scroll (popup view)
 */
export async function queryEntriesInfinite(
  feedId: string | 'all',
  options: {
    limit?: number;
    maxTotal?: number;
    keyword?: string;
    isRead?: boolean;
    lastCreateTime?: number;
    excludeInactiveFeeds?: boolean;
  } = {}
): Promise<{ data: Entry[]; hasMore: boolean; total: number }> {
  const {
    limit = 20,
    maxTotal = 100,
    keyword,
    isRead,
    lastCreateTime,
    excludeInactiveFeeds = false,
  } = options;

  let collection = feedId === 'all'
    ? db.entries.toCollection()
    : db.entries.where('feedId').equals(feedId);

  // Get all data first, then filter in memory
  let allData = await collection.toArray();

  // Skip entries from inactive feeds when required
  if (excludeInactiveFeeds && feedId === 'all') {
    const activeFeedIds = new Set(
      (await getAllFeeds({ activeOnly: true })).map(feed => feed.id),
    );
    if (activeFeedIds.size === 0) {
      allData = [];
    } else {
      allData = allData.filter(entry => activeFeedIds.has(entry.feedId));
    }
  }

  // Filter by read status
  if (isRead !== undefined) {
    allData = allData.filter(entry => entry.isRead === isRead);
  }

  // Filter by keyword
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();
    allData = allData.filter(entry =>
      entry.title.toLowerCase().includes(lowerKeyword) ||
      (entry.author && entry.author.toLowerCase().includes(lowerKeyword))
    );
  }

  // Apply cursor for pagination
  if (lastCreateTime) {
    allData = allData.filter(entry => entry.createTime < lastCreateTime);
  }

  // Sort by createTime descending
  allData.sort((a, b) => b.createTime - a.createTime);

  // Get total count before limiting
  const total = allData.length;

  // Get limited data
  const data = await attachFavoriteMetadata(
    allData.slice(0, Math.min(limit, maxTotal)),
  );

  return {
    data,
    hasMore: data.length >= limit && total > data.length && data.length < maxTotal,
    total: Math.min(total, maxTotal),
  };
}

/**
 * Toggle entry read status
 */
export async function toggleEntryRead(entryId: string): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry) {
    throw new Error('Entry not found');
  }

  const nextIsRead = !entry.isRead;
  await db.entries.update(entryId, { isRead: nextIsRead });
  await broadcastEntryReadChanged(entry.feedId);
}

/**
 * Mark entry as read
 */
export async function markEntryAsRead(entryId: string): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry) {
    throw new Error('Entry not found');
  }

  if (entry.isRead) {
    return;
  }

  await db.entries.update(entryId, { isRead: true });
  await broadcastEntryReadChanged(entry.feedId);
}

/**
 * Mark all entries as read for a feed
 */
export async function markAllAsRead(feedId: string | 'all'): Promise<void> {
  if (feedId === 'all') {
    await db.entries.toCollection().modify({ isRead: true });
  } else {
    await db.entries.where('feedId').equals(feedId).modify({ isRead: true });
  }
  console.log('[Feed Service] Marked all as read:', feedId);
  await broadcastEntryReadChanged(feedId);
}

/**
 * Get unread count
 */
export async function getUnreadCount(
  feedId?: string,
  options: { activeOnly?: boolean } = {},
): Promise<number> {
  const { activeOnly = false } = options;

  if (!feedId || feedId === 'all') {
    let allEntries = await db.entries.toArray();

    if (activeOnly) {
      const activeFeedIds = new Set(
        (await getAllFeeds({ activeOnly: true })).map(feed => feed.id),
      );
      if (activeFeedIds.size === 0) {
        return 0;
      }
      allEntries = allEntries.filter(entry => activeFeedIds.has(entry.feedId));
    }

    return allEntries.filter(entry => entry.isRead === false).length;
  }

  const feedEntries = await db.entries.where('feedId').equals(feedId).toArray();
  return feedEntries.filter(entry => entry.isRead === false).length;
}

/**
 * Increment feed failure count
 */
export async function incrementFailureCount(feedId: string): Promise<number> {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  const newCount = feed.failureCount + 1;
  await db.feeds.update(feedId, { failureCount: newCount, updateTime: Date.now() });

  // Disable feed if failure count exceeds threshold
  if (newCount >= RSS_POLLER.MAX_FAILURE_COUNT) {
    await db.feeds.update(feedId, { status: false, updateTime: Date.now() });
    console.warn(`[Feed Service] Feed ${feedId} disabled due to ${newCount} consecutive failures`);
  }

  return newCount;
}

/**
 * Reset feed failure count
 */
export async function resetFailureCount(feedId: string): Promise<void> {
  await db.feeds.update(feedId, { failureCount: 0, updateTime: Date.now() });
}

/**
 * Update feed last sync time
 */
export async function updateLastSync(feedId: string): Promise<void> {
  const timestamp = Date.now();
  await db.feeds.update(feedId, { lastSyncAt: timestamp, updateTime: timestamp });
}

async function attachFavoriteMetadata(entries: Entry[]): Promise<Entry[]> {
  if (!entries.length) {
    return entries;
  }

  const entryIds = entries
    .map(entry => entry.id)
    .filter((id): id is string => Boolean(id));

  if (!entryIds.length) {
    return entries;
  }

  let favorites: Array<{ favoriteId: string; itemId?: string }>;
  try {
    favorites = await db.favorites.where('itemId').anyOf(entryIds).toArray();
  } catch (error) {
    console.error('[Feed Service] Failed to load favorites metadata:', error);
    return entries;
  }

  const favoriteMap = new Map<string, { favoriteId: string }>();
  favorites.forEach(favorite => {
    if (favorite.itemId) {
      favoriteMap.set(favorite.itemId, { favoriteId: favorite.favoriteId });
    }
  });

  return entries.map(entry => ({
    ...entry,
    isFavorite: favoriteMap.has(entry.id),
    favoriteId: favoriteMap.get(entry.id)?.favoriteId,
  }));
}
