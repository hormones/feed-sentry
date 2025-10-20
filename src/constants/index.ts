// ==================== Message Types ====================

/**
 * Message types for extension communication
 */
export enum MessageType {
  // Sync related
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',

  // Feed related
  FEED_UPDATED = 'feed_updated',
  FEED_DISABLED = 'feed_disabled',

  // Entry related
  ENTRIES_ADDED = 'entries_added',
  ENTRY_READ_CHANGED = 'entry_read_changed',
  FAVORITES_UPDATED = 'favorites_updated',
  FAVORITE_FOLDERS_UPDATED = 'favorite_folders_updated',

  // Badge related
  BADGE_UPDATE = 'badge_update',

  // Settings related
  SETTINGS_CHANGED = 'settings_changed',

  // Request types
  GET_UNREAD_COUNT = 'get_unread_count',
  TRIGGER_SYNC = 'trigger_sync',
  TEST_NOTIFICATION = 'test_notification',
}

// ==================== Storage Keys ====================

/**
 * Storage keys for chrome.storage.local
 */
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  POPUP_SCROLL_STATE: 'popup_scroll_state',
  POPUP_VIEW_STATE: 'popup_view_state',
} as const;

// ==================== RSS Poller Constants ====================

/**
 * RSS poller configuration
 */
export const RSS_POLLER = {
  ALARM_NAME: 'rss-poller',
  MIN_POLL_INTERVAL: 60 as number, // Minimum 1 minute (in seconds)
  DEFAULT_POLL_INTERVAL: 600 as number, // Default 10 minutes (in seconds)
  MAX_FAILURE_COUNT: 100,
} as const;

// ==================== Feed Constants ====================

/**
 * Feed and entry limits
 */
export const FEED_LIMITS = {
  MAX_ENTRIES_PER_FEED: 2000,
  ENTRIES_TO_DELETE: 200,
} as const;

// ==================== Default Settings ====================

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS = {
  THEME: 'auto' as const,
  LOCALE: 'zh-CN' as const,
} as const;

// ==================== HTTP Client Constants ====================

/**
 * HTTP client configuration
 */
export const HTTP_CLIENT = {
  TIMEOUT: 15000, // 15 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  USER_AGENT: 'FeedSentry/0.1.0',
} as const;

// ==================== UI Constants ====================

/**
 * UI configuration
 */
export const UI = {
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  INFINITE_SCROLL_LIMIT: 20,
  INFINITE_SCROLL_MAX: 100,

  // Badge
  BADGE_MAX_DISPLAY: 999,
  BADGE_COLOR: '#f56c6c',
} as const;

// ==================== Notification Priority ====================

/**
 * Browser notification priority levels
 */
export const NOTIFICATION_PRIORITY = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
} as const;

export default {
  MessageType,
  STORAGE_KEYS,
  RSS_POLLER,
  FEED_LIMITS,
  DEFAULT_SETTINGS,
  HTTP_CLIENT,
  UI,
  NOTIFICATION_PRIORITY,
};
