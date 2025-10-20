// Export database models and instance
export { db, type Feed, type Entry } from './db';
export type { FavoriteEntry, FavoriteFolder } from './db';

// Export HTTP client and feed fetching utilities
export { default as httpClient, requestFeed, validateFeedUrl, type FeedFetchResult } from './http-client';
export {
  buildOriginPermission,
  hasFeedHostPermission,
  requestFeedHostPermission,
} from './permission-service';

// Export feed service functions
export {
  // Feed operations
  addFeed,
  updateFeed,
  deleteFeed,
  getFeed,
  getAllFeeds,
  searchFeeds,

  // Entry operations
  addEntries,
  queryEntries,
  queryEntriesInfinite,
  toggleEntryRead,
  markEntryAsRead,
  markAllAsRead,
  getUnreadCount,

  // Feed status operations
  incrementFailureCount,
  resetFailureCount,
  updateLastSync,

  // Utilities
  formatBadgeText,
  generateFeedId,
  generateEntryId,

  // Types
  type PaginatedResult,
  type QueryOptions,
} from './feed-service';

export {
  addFavorite,
  toggleFavorite,
  removeFavoriteByEntry,
  listFavorites,
  listFavoriteFolders,
  createFavoriteFolder,
  renameFavoriteFolder,
  deleteFavoriteFolder,
  moveFavorites,
  removeFavorites,
  getDefaultFavoriteFolder,
  findFavoriteByEntry,
  isEntryFavorited,
  listAllFavorites,
  type FavoritePayload,
  type FavoriteFolderWithCount,
  type FavoriteQueryOptions,
  type FavoriteOrigin,
  type FavoriteCreatedFrom,
} from './favorite-service';
