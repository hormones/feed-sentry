import browser from 'webextension-polyfill';
import {formatBadgeText, getUnreadCount} from '@/services';
import {MessageType, NOTIFICATION_PRIORITY, UI} from '@/constants';
import { t } from '@/i18n';

// Message payload types
export interface Message<T = any> {
  type: MessageType;
  payload?: T;
  timestamp: number;
}

export interface SyncStartedPayload {
  feedId: string;
  feedTitle: string;
}

export interface SyncCompletedPayload {
  feedId: string;
  feedTitle: string;
  added: number;
  skipped: number;
}

export interface SyncFailedPayload {
  feedId: string;
  feedTitle: string;
  error: string;
  failureCount: number;
}

export interface FeedDisabledPayload {
  feedId: string;
  feedTitle: string;
  reason: string;
}

export interface EntriesAddedPayload {
  feedId: string;
  count: number;
}

export interface BadgeUpdatePayload {
  count: number;
}

export interface TestNotificationPayload {
  title?: string;
  message?: string;
  keywords?: string[];
  source?: string;
}

/**
 * Create a message
 */
export function createMessage<T>(type: MessageType, payload?: T): Message<T> {
  return {
    type,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Broadcast message to all extension contexts
 */
export async function broadcastMessage<T>(type: MessageType, payload?: T): Promise<void> {
  const message = createMessage(type, payload);

  try {
    // Send to all tabs/contexts
    await browser.runtime.sendMessage(message);
    console.log('[Messaging] Broadcasted:', type, payload);
  } catch (error) {
    // Ignore if no listeners
    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      return;
    }
    console.error('[Messaging] Broadcast error:', error);
  }
}

/**
 * Send message to specific tab
 */
export async function sendMessageToTab<T>(
  tabId: number,
  type: MessageType,
  payload?: T
): Promise<void> {
  const message = createMessage(type, payload);

  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[Messaging] Send to tab error:', error);
  }
}

/**
 * Update extension badge with unread count
 */
export async function updateBadge(count?: number): Promise<void> {
  try {
    const unreadCount = count ?? await getUnreadCount();

    // Update badge text
    const badgeText = formatBadgeText(unreadCount);
    await browser.action.setBadgeText({ text: badgeText });

    // Update badge color (red for unread)
    if (unreadCount > 0) {
      await browser.action.setBadgeBackgroundColor({ color: UI.BADGE_COLOR });
    }

    // Broadcast badge update
    await broadcastMessage(MessageType.BADGE_UPDATE, { count: unreadCount });

    console.log('[Messaging] Badge updated:', unreadCount);
  } catch (error) {
    console.error('[Messaging] Update badge error:', error);
  }
}

/**
 * Show browser notification
 */
export async function showNotification(options: {
  title: string;
  message: string;
  iconUrl?: string;
  type?: 'basic' | 'image' | 'list' | 'progress';
  priority?: number;
}): Promise<string> {
  try {
    const notificationId = await browser.notifications.create({
      type: options.type || 'basic',
      iconUrl: options.iconUrl || browser.runtime.getURL('icon/icon128.png'),
      title: options.title,
      message: options.message,
      priority: options.priority || 0,
    });

    console.log('[Messaging] Notification shown:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('[Messaging] Show notification error:', error);
    throw error;
  }
}

/**
 * Send test notification for debugging
 */
export async function sendTestNotification(payload?: TestNotificationPayload): Promise<void> {
  const baseTitle = t('background.messaging.testNotificationTitle');
  const baseMessage = t('background.messaging.testNotificationMessage');

  let messageBody = payload?.message ?? baseMessage;
  if (!payload?.message && payload?.keywords?.length) {
    const keywordText = t('background.feedService.keywordMatchMessage', {
      keywords: payload.keywords.join(', '),
    });
    messageBody = `${baseMessage} ${keywordText}`;
  }

  const titleSuffix = payload?.source ? ` - ${payload.source}` : '';

  await showNotification({
    title: payload?.title ?? `${baseTitle}${titleSuffix}`,
    message: messageBody,
    priority: NOTIFICATION_PRIORITY.NORMAL,
  });
}

/**
 * Send sync started notification
 */
export async function notifySyncStarted(feedId: string, feedTitle: string): Promise<void> {
  await broadcastMessage<SyncStartedPayload>(MessageType.SYNC_STARTED, {
    feedId,
    feedTitle,
  });
}

/**
 * Send sync completed notification
 */
export async function notifySyncCompleted(
  feedId: string,
  feedTitle: string,
  added: number,
  skipped: number
): Promise<void> {
  await broadcastMessage<SyncCompletedPayload>(MessageType.SYNC_COMPLETED, {
    feedId,
    feedTitle,
    added,
    skipped,
  });

  // Update badge after sync
  await updateBadge();
}

/**
 * Send sync failed notification
 */
export async function notifySyncFailed(
  feedId: string,
  feedTitle: string,
  error: string,
  failureCount: number
): Promise<void> {
  await broadcastMessage<SyncFailedPayload>(MessageType.SYNC_FAILED, {
    feedId,
    feedTitle,
    error,
    failureCount,
  });

  // Show browser notification if failure count is high
  if (failureCount >= 10 && failureCount % 10 === 0) {
    await showNotification({
      title: 'Feed Sync Warning',
      message: `"${feedTitle}" has failed ${failureCount} times. Check your feed URL.`,
      priority: NOTIFICATION_PRIORITY.NORMAL,
    });
  }
}

/**
 * Send feed disabled notification
 */
export async function notifyFeedDisabled(
  feedId: string,
  feedTitle: string,
  reason: string
): Promise<void> {
  await broadcastMessage<FeedDisabledPayload>(MessageType.FEED_DISABLED, {
    feedId,
    feedTitle,
    reason,
  });

  // Show browser notification
  await showNotification({
    title: 'Feed Disabled',
    message: `"${feedTitle}" has been disabled: ${reason}`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  });
}

/**
 * Setup message listener in background
 */
export function setupMessageListener(): void {
  browser.runtime.onMessage.addListener((message: any, sender: any) => {
    console.log('[Messaging] Received:', message.type, message.payload, 'from', sender.tab?.id);

    // Handle specific message types if needed
    switch (message.type) {
      case MessageType.GET_UNREAD_COUNT:
        return getUnreadCount().then(count => ({ count }));

      case MessageType.ENTRY_READ_CHANGED:
        return updateBadge().then(() => ({ success: true }));

      case MessageType.TRIGGER_SYNC:
        // Will be handled by rss-poller
        return Promise.resolve({ success: true });

      case MessageType.TEST_NOTIFICATION:
        return sendTestNotification(message.payload).then(() => ({ success: true }));

      default:
        return Promise.resolve();
    }
  });

  console.log('[Messaging] Message listener setup complete');
}

export default {
  createMessage,
  broadcastMessage,
  sendMessageToTab,
  updateBadge,
  showNotification,
  notifySyncStarted,
  notifySyncCompleted,
  notifySyncFailed,
  notifyFeedDisabled,
  sendTestNotification,
  setupMessageListener,
};
