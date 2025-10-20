import browser from 'webextension-polyfill';
import {
  getAllFeeds,
  getFeed,
  addEntries,
  incrementFailureCount,
  resetFailureCount,
  updateLastSync,
  hasFeedHostPermission,
  type Feed,
} from '@/services';
import { requestFeed } from '@/services/http-client';
import {
  notifySyncStarted,
  notifySyncCompleted,
  notifySyncFailed,
  notifyFeedDisabled,
  updateBadge,
} from './messaging';
import { RSS_POLLER } from '@/constants';

// Polling state
let isPolling = false;

/**
 * Calculate minimum poll interval from all active feeds
 */
async function calculateMinPollInterval(): Promise<number> {
  try {
    const feeds = await getAllFeeds({ activeOnly: true });

    if (feeds.length === 0) {
      return RSS_POLLER.DEFAULT_POLL_INTERVAL;
    }

    const minInterval = Math.min(
      ...feeds.map(feed => feed.pollInterval || RSS_POLLER.DEFAULT_POLL_INTERVAL)
    );

    return Math.max(minInterval, RSS_POLLER.MIN_POLL_INTERVAL);
  } catch (error) {
    console.error('[RSS Poller] Calculate min interval error:', error);
    return RSS_POLLER.DEFAULT_POLL_INTERVAL;
  }
}

/**
 * Check if a feed should be polled based on its last sync time
 */
function shouldPollFeed(feed: Feed): boolean {
  if (!feed.status) {
    return false;
  }

  if (!feed.lastSyncAt) {
    return true;
  }

  const now = Date.now();
  const elapsed = (now - feed.lastSyncAt) / 1000; // Convert to seconds
  const interval = feed.pollInterval || RSS_POLLER.DEFAULT_POLL_INTERVAL;

  return elapsed >= interval;
}

/**
 * Poll a single feed
 */
async function pollFeed(feed: Feed): Promise<void> {
  console.log('[RSS Poller] Polling feed:', feed.title, feed.link);

  try {
    const permissionGranted = await hasFeedHostPermission(feed.link);
    if (!permissionGranted) {
      console.warn('[RSS Poller] Missing host permission, skipping:', feed.link);
      await notifySyncFailed(
        feed.id,
        feed.title,
        'Site access not granted. Please allow host permission in Feed Management.',
        feed.failureCount,
      );
      return;
    }

    // Notify sync started
    await notifySyncStarted(feed.id, feed.title);

    // Fetch feed
    const result = await requestFeed(feed.link, {
      maxRetries: 2,
      retryDelay: 1000,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch feed');
    }

    // Add entries to database
    const { added, skipped } = await addEntries(feed.id, result.data.items);

    // Reset failure count on success
    if (feed.failureCount > 0) {
      await resetFailureCount(feed.id);
    }

    // Update last sync time
    await updateLastSync(feed.id);

    // Notify sync completed
    await notifySyncCompleted(feed.id, feed.title, added, skipped);

    console.log(`[RSS Poller] Feed "${feed.title}" synced: +${added}, skip ${skipped}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[RSS Poller] Feed "${feed.title}" sync failed:`, errorMessage);

    // Increment failure count
    const newFailureCount = await incrementFailureCount(feed.id);

    // Notify sync failed
    await notifySyncFailed(feed.id, feed.title, errorMessage, newFailureCount);

    // Check if feed should be disabled
    if (newFailureCount >= RSS_POLLER.MAX_FAILURE_COUNT) {
      await notifyFeedDisabled(
        feed.id,
        feed.title,
        `Failed ${RSS_POLLER.MAX_FAILURE_COUNT} consecutive times`
      );
    }
  }
}

/**
 * Poll all feeds that are due for update
 */
async function pollAllFeeds(): Promise<void> {
  if (isPolling) {
    console.log('[RSS Poller] Already polling, skipping...');
    return;
  }

  isPolling = true;

  try {
    console.log('[RSS Poller] Starting poll cycle...');

    // Get all active feeds
    const feeds = await getAllFeeds({ activeOnly: true });

    if (feeds.length === 0) {
      console.log('[RSS Poller] No active feeds to poll');
      return;
    }

    // Filter feeds that should be polled
    const feedsToPoll = feeds.filter(shouldPollFeed);

    if (feedsToPoll.length === 0) {
      console.log('[RSS Poller] No feeds due for polling');
      return;
    }

    console.log(`[RSS Poller] Polling ${feedsToPoll.length}/${feeds.length} feeds`);

    // Poll feeds sequentially to avoid overwhelming the system
    for (const feed of feedsToPoll) {
      await pollFeed(feed);
    }

    // Update badge after all polls
    await updateBadge();

    console.log('[RSS Poller] Poll cycle completed');
  } catch (error) {
    console.error('[RSS Poller] Poll cycle error:', error);
  } finally {
    isPolling = false;
  }
}

/**
 * Setup Chrome Alarms for periodic polling
 */
async function setupAlarm(): Promise<void> {
  try {
    // Calculate minimum poll interval from active feeds
    const minInterval = await calculateMinPollInterval();

    // Clear existing alarm
    await browser.alarms.clear(RSS_POLLER.ALARM_NAME);

    // Create new alarm
    await browser.alarms.create(RSS_POLLER.ALARM_NAME, {
      delayInMinutes: minInterval / 60,
      periodInMinutes: minInterval / 60,
    });

    console.log(`[RSS Poller] Alarm setup: interval ${minInterval}s (${minInterval / 60}min)`);
  } catch (error) {
    console.error('[RSS Poller] Setup alarm error:', error);
  }
}

/**
 * Handle alarm events
 */
function handleAlarm(alarm: browser.Alarms.Alarm): void {
  if (alarm.name === RSS_POLLER.ALARM_NAME) {
    console.log('[RSS Poller] Alarm triggered:', alarm.name);
    pollAllFeeds().catch(error => {
      console.error('[RSS Poller] Poll error:', error);
    });
  }
}

/**
 * Start RSS poller
 */
export async function startPoller(): Promise<void> {
  console.log('[RSS Poller] Starting...');

  // Setup alarm
  await setupAlarm();

  // Setup alarm listener
  browser.alarms.onAlarm.addListener(handleAlarm);

  // Perform initial poll
  await pollAllFeeds();

  // Update badge
  await updateBadge();

  console.log('[RSS Poller] Started');
}

/**
 * Stop RSS poller
 */
export async function stopPoller(): Promise<void> {
  console.log('[RSS Poller] Stopping...');

  // Clear alarm
  await browser.alarms.clear(RSS_POLLER.ALARM_NAME);

  // Remove listener
  browser.alarms.onAlarm.removeListener(handleAlarm);

  console.log('[RSS Poller] Stopped');
}

/**
 * Restart poller (useful when feed settings change)
 */
export async function restartPoller(): Promise<void> {
  console.log('[RSS Poller] Restarting...');
  await stopPoller();
  await startPoller();
}

/**
 * Manually trigger a sync for a specific feed
 */
export async function syncFeed(feedId: string): Promise<void> {
  console.log('[RSS Poller] Manual sync requested for:', feedId);

  const feed = await getFeed(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  await pollFeed(feed);
  await updateBadge();
}

/**
 * Manually trigger a sync for all feeds
 */
export async function syncAllFeeds(): Promise<void> {
  console.log('[RSS Poller] Manual sync all requested');
  await pollAllFeeds();
}

export default {
  startPoller,
  stopPoller,
  restartPoller,
  syncFeed,
  syncAllFeeds,
};
