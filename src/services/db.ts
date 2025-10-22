import Dexie, { Table } from 'dexie';

interface IDBKeyRangeConstructor {
  readonly prototype: IDBKeyRange;
  bound(lower: unknown, upper: unknown, lowerOpen?: boolean, upperOpen?: boolean): IDBKeyRange;
  only(value: unknown): IDBKeyRange;
  lowerBound(lower: unknown, open?: boolean): IDBKeyRange;
  upperBound(upper: unknown, open?: boolean): IDBKeyRange;
}

type IndexedDBGlobal = typeof globalThis & {
  mozIndexedDB?: IDBFactory;
  webkitIndexedDB?: IDBFactory;
  msIndexedDB?: IDBFactory;
  webkitIDBKeyRange?: IDBKeyRangeConstructor;
  msIDBKeyRange?: IDBKeyRangeConstructor;
};

const indexedDbGlobal = globalThis as IndexedDBGlobal;

const resolvedIndexedDB =
  indexedDbGlobal.indexedDB ??
  indexedDbGlobal.mozIndexedDB ??
  indexedDbGlobal.webkitIndexedDB ??
  indexedDbGlobal.msIndexedDB ??
  null;

const resolvedIDBKeyRange =
  indexedDbGlobal.IDBKeyRange ??
  indexedDbGlobal.webkitIDBKeyRange ??
  indexedDbGlobal.msIDBKeyRange ??
  null;

const indexedDbSupported = Boolean(resolvedIndexedDB);

if (indexedDbSupported && resolvedIndexedDB) {
  Dexie.dependencies.indexedDB = resolvedIndexedDB;
  if (resolvedIDBKeyRange) {
    Dexie.dependencies.IDBKeyRange = resolvedIDBKeyRange;
  }
}

// Feed model - represents a subscription source
export interface Feed {
  id: string;                    // URL hash
  title: string;                 // Feed title
  link: string;                  // Feed URL
  pollInterval: number;          // Polling interval in seconds (default: 600)
  notify: boolean;               // Enable notifications
  keywords: string[];            // Highlight keywords
  keywordNotify: boolean;        // Enable keyword notifications
  status: boolean;               // Active status
  failureCount: number;          // Consecutive failure count
  lastSyncAt?: number;           // Last sync timestamp
  createTime: number;            // Creation timestamp
  updateTime: number;            // Last update timestamp
}

// Entry model - represents a feed item
export interface Entry {
  id: string;                    // Composite key: feedId + entry guid
  feedId: string;                // Reference to feed ID
  title: string;                 // Entry title
  author?: string;               // Entry author
  link?: string;                 // Entry URL
  pubDate?: string;              // Publication date
  createTime: number;            // Timestamp when entry was stored
  isRead: boolean;               // Read status
  keywords?: string[];           // Matched keywords
  // Derived marker for UI state; not persisted in the entries table
  isFavorite?: boolean;
  favoriteId?: string;
}

export interface FavoriteFolder {
  folderId: string;
  name: string;
  isDefault: boolean;
  order: number;
  createTime: number;
  updateTime: number;
}

export interface FavoriteEntry {
  favoriteId: string;
  folderId: string;
  itemId?: string;
  title: string;
  link: string;
  source: 'subscription' | 'manual';
  createTime: number;
  updateTime: number;
  createdFrom: 'popup' | 'options' | 'background';
}

// Database class
export class FeedSentryDB extends Dexie {
  feeds!: Table<Feed, string>;
  entries!: Table<Entry, string>;
  favoriteFolders!: Table<FavoriteFolder, string>;
  favorites!: Table<FavoriteEntry, string>;

  constructor() {
    super('FeedSentryDB');

    // Define database schema
    this.version(1).stores({
      feeds: 'id, title, link, status, createTime, updateTime, lastSyncAt',
      entries: 'id, feedId, createTime, isRead, [feedId+createTime]',
      favoriteFolders: 'folderId, order, createTime, updateTime, isDefault',
      favorites: 'favoriteId, itemId, folderId, link, source, createTime, updateTime, [folderId+createTime]',
    });

    // Map tables to models
    this.feeds = this.table('feeds');
    this.entries = this.table('entries');
    this.favoriteFolders = this.table('favoriteFolders');
    this.favorites = this.table('favorites');
  }

  /**
   * Initialize database with default data if needed
   */
  async initialize(): Promise<void> {
    try {
      await ensureDefaultFavoriteFolder(this.favoriteFolders);
      const feedCount = await this.feeds.count();
      if (feedCount === 0) {
        console.log('[DB] Database initialized with no feeds');
      }
    } catch (error) {
      console.error('[DB] Initialization error:', error);
    }
  }

  /**
   * Clear all data (for testing/reset)
   */
  async clearAll(): Promise<void> {
    await this.transaction('rw', [this.feeds, this.entries, this.favoriteFolders, this.favorites], async () => {
      await this.feeds.clear();
      await this.entries.clear();
      await this.favoriteFolders.clear();
      await this.favorites.clear();
    });
    console.log('[DB] All data cleared');
  }

  /**
   * Get database size estimate
   */
  async getSize(): Promise<{ feeds: number; entries: number }> {
    const feeds = await this.feeds.count();
    const entries = await this.entries.count();
    return { feeds, entries };
  }
}

export class IndexedDbUnavailableError extends Error {
  constructor(message = 'IndexedDB API missing. Feed Sentry requires IndexedDB support to persist subscription data.') {
    super(message);
    this.name = 'IndexedDbUnavailableError';
  }
}

let dbInstance: FeedSentryDB | null = null;

function requireDatabase(): FeedSentryDB {
  if (!indexedDbSupported) {
    throw new IndexedDbUnavailableError();
  }

  if (!dbInstance) {
    dbInstance = new FeedSentryDB();
  }

  return dbInstance;
}

const proxyTarget = Object.create(FeedSentryDB.prototype) as FeedSentryDB;

export const db: FeedSentryDB = new Proxy(proxyTarget, {
  get(_target, property) {
    const instance = requireDatabase();
    const value = Reflect.get(instance as any, property);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  set(_target, property, value) {
    const instance = requireDatabase();
    Reflect.set(instance as any, property, value);
    return true;
  },
  has(_target, property) {
    return property in requireDatabase();
  },
  ownKeys() {
    return Reflect.ownKeys(requireDatabase());
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Object.getOwnPropertyDescriptor(requireDatabase(), property as any);
    if (descriptor) {
      descriptor.configurable = true;
    }
    return descriptor;
  },
});

if (indexedDbSupported) {
  const instance = requireDatabase();
  instance.initialize().catch(error => {
    console.error('[DB] Failed to initialize database:', error);
  });
} else {
  console.warn('[DB] IndexedDB API missing. Database layer disabled until the environment provides IndexedDB.');
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (Dexie as any).utils.getHexaDecimalRandomString(32);
}

export async function ensureDefaultFavoriteFolder(
  folderTable: Table<FavoriteFolder, string>,
): Promise<FavoriteFolder> {
  const existing = await folderTable
    .toCollection()
    .filter(folder => folder.isDefault === true)
    .first();
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const folder: FavoriteFolder = {
    folderId: generateUuid(),
    name: 'Default Favorites',
    isDefault: true,
    order: 0,
    createTime: now,
    updateTime: now,
  };
  await folderTable.add(folder);
  return folder;
}
