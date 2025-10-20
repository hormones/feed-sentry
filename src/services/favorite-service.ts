import Dexie from 'dexie';
import browser from 'webextension-polyfill';
import { db, type FavoriteEntry, type FavoriteFolder, ensureDefaultFavoriteFolder } from './db';
import { MessageType } from '@/constants';

export type FavoriteCreatedFrom = FavoriteEntry['createdFrom'];
export type FavoriteOrigin = FavoriteEntry['source'];

export interface FavoritePayload {
  itemId?: string;
  entryId?: string;
  link?: string | null;
  title: string;
  source?: FavoriteOrigin;
  createdFrom?: FavoriteCreatedFrom;
  folderId?: string;
}

export interface FavoriteFolderWithCount extends FavoriteFolder {
  total: number;
}

export interface FavoriteQueryOptions {
  keyword?: string;
  folderId?: string;
  limit?: number;
  offset?: number;
  sort?: 'createTime-desc' | 'createTime-asc' | 'title-asc' | 'title-desc';
}

function now(): number {
  return Date.now();
}

function resolveCreatedFrom(createdFrom?: FavoriteCreatedFrom): FavoriteCreatedFrom {
  return createdFrom ?? 'popup';
}

function resolveOrigin(origin?: FavoriteOrigin, itemId?: string): FavoriteOrigin {
  if (origin) {
    return origin;
  }
  return itemId ? 'subscription' : 'manual';
}

async function broadcast(type: MessageType): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      return;
    }
    console.error('[Favorite Service] Broadcast error:', type, error);
  }
}

export async function getDefaultFavoriteFolder(): Promise<FavoriteFolder> {
  return ensureDefaultFavoriteFolder(db.favoriteFolders);
}

export async function listFavoriteFolders(): Promise<FavoriteFolderWithCount[]> {
  const folders = await db.favoriteFolders.orderBy('order').toArray();
  const counts = await db.favorites.toArray();
  const totals = counts.reduce<Record<string, number>>((acc, item) => {
    acc[item.folderId] = (acc[item.folderId] ?? 0) + 1;
    return acc;
  }, {});

  return folders.map(folder => ({
    ...folder,
    total: totals[folder.folderId] ?? 0,
  }));
}

export async function createFavoriteFolder(name: string): Promise<FavoriteFolder> {
  const folders = await db.favoriteFolders.toArray();
  const maxOrder = folders.reduce((max, folder) => Math.max(max, folder.order), 0);
  const folder: FavoriteFolder = {
    folderId: createId(),
    name,
    isDefault: false,
    order: maxOrder + 1,
    createTime: now(),
    updateTime: now(),
  };
  await db.favoriteFolders.add(folder);
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
  return folder;
}

export async function renameFavoriteFolder(folderId: string, name: string): Promise<void> {
  const folder = await db.favoriteFolders.get(folderId);
  if (!folder) {
    throw new Error('Folder not found');
  }
  await db.favoriteFolders.update(folderId, {
    name,
    updateTime: now(),
  });
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
}

export async function deleteFavoriteFolder(
  folderId: string,
  strategy: 'move-to-default' | 'delete-all',
): Promise<void> {
  const folder = await db.favoriteFolders.get(folderId);
  if (!folder) {
    throw new Error('Folder not found');
  }
  if (folder.isDefault) {
    throw new Error('Default folder cannot be deleted');
  }

  const defaultFolder = await getDefaultFavoriteFolder();

  await db.transaction('rw', db.favoriteFolders, db.favorites, async () => {
    if (strategy === 'move-to-default') {
      await db.favorites.where('folderId').equals(folderId).modify(item => {
        item.folderId = defaultFolder.folderId;
        const timestamp = now();
        item.createTime = timestamp;
        item.updateTime = timestamp;
      });
    } else {
      await db.favorites.where('folderId').equals(folderId).delete();
    }
    await db.favoriteFolders.delete(folderId);
  });

  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
  await broadcast(MessageType.FAVORITES_UPDATED);
}

export async function moveFavorites(
  favoriteIds: string[],
  targetFolderId: string,
): Promise<void> {
  if (!favoriteIds.length) {
    return;
  }
  const targetFolder = await db.favoriteFolders.get(targetFolderId);
  if (!targetFolder) {
    throw new Error('Target folder not found');
  }
  await db.favorites.where('favoriteId').anyOf(favoriteIds).modify(item => {
    item.folderId = targetFolder.folderId;
    const timestamp = now();
    item.createTime = timestamp;
    item.updateTime = timestamp;
  });
  await broadcast(MessageType.FAVORITES_UPDATED);
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
}

export async function removeFavorites(favoriteIds: string[]): Promise<void> {
  if (!favoriteIds.length) {
    return;
  }
  await db.favorites.where('favoriteId').anyOf(favoriteIds).delete();
  await broadcast(MessageType.FAVORITES_UPDATED);
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
}

function normalizeLink(link?: string | null): string {
  return (link ?? '').trim();
}

function resolvePayloadIdentifiers(payload: FavoritePayload): { itemId?: string; link: string } {
  const itemId = payload.itemId ?? payload.entryId;
  const link = normalizeLink(payload.link);
  if (!itemId && !link) {
    throw new Error('Favorite link is required.');
  }
  return { itemId, link };
}

export async function findFavoriteByEntry(itemId?: string, link?: string | null): Promise<FavoriteEntry | undefined> {
  const normalizedLink = normalizeLink(link);
  if (itemId) {
    const byItemId = await db.favorites.where('itemId').equals(itemId).first();
    if (byItemId) {
      return byItemId;
    }
  }
  if (normalizedLink) {
    return db.favorites.where('link').equals(normalizedLink).first();
  }
  return undefined;
}

async function resolveTargetFolderId(folderId?: string): Promise<string> {
  if (folderId) {
    const existing = await db.favoriteFolders.get(folderId);
    if (existing) {
      return existing.folderId;
    }
  }
  const defaultFolder = await getDefaultFavoriteFolder();
  return defaultFolder.folderId;
}

export async function addFavorite(payload: FavoritePayload): Promise<FavoriteEntry> {
  const { itemId, link } = resolvePayloadIdentifiers(payload);
  const existing = await findFavoriteByEntry(itemId, link);
  if (existing) {
    return existing;
  }

  const folderId = await resolveTargetFolderId(payload.folderId);
  const favorite: FavoriteEntry = {
    favoriteId: createId(),
    folderId,
    itemId,
    title: payload.title,
    link,
    source: resolveOrigin(payload.source, itemId),
    createTime: now(),
    updateTime: now(),
    createdFrom: resolveCreatedFrom(payload.createdFrom),
  };

  await db.favorites.add(favorite);
  await broadcast(MessageType.FAVORITES_UPDATED);
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
  return favorite;
}

export async function toggleFavorite(
  payload: FavoritePayload,
): Promise<{ favorite?: FavoriteEntry; isFavorite: boolean }> {
  const { itemId, link } = resolvePayloadIdentifiers(payload);
  const existing = await findFavoriteByEntry(itemId, link);
  if (existing) {
    await db.favorites.delete(existing.favoriteId);
    await broadcast(MessageType.FAVORITES_UPDATED);
    await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
    return { isFavorite: false };
  }

  const favorite = await addFavorite({ ...payload, itemId, link });
  return { favorite, isFavorite: true };
}

export async function removeFavoriteByEntry(itemId?: string, link?: string | null): Promise<boolean> {
  const existing = await findFavoriteByEntry(itemId, link);
  if (!existing) {
    return false;
  }
  await db.favorites.delete(existing.favoriteId);
  await broadcast(MessageType.FAVORITES_UPDATED);
  await broadcast(MessageType.FAVORITE_FOLDERS_UPDATED);
  return true;
}

export async function listFavorites(
  folderId: string,
  options: FavoriteQueryOptions = {},
): Promise<{ data: FavoriteEntry[]; total: number }> {
  const {
    keyword,
    limit,
    offset = 0,
    sort = 'createTime-desc',
  } = options;

  let collection = db.favorites.where('folderId').equals(folderId);
  let items = await collection.toArray();

  if (keyword) {
    const lower = keyword.toLowerCase();
    items = items.filter(item =>
      item.title.toLowerCase().includes(lower) ||
      item.link.toLowerCase().includes(lower),
    );
  }

  switch (sort) {
    case 'createTime-asc':
      items.sort((a, b) => a.createTime - b.createTime);
      break;
    case 'title-asc':
      items.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'title-desc':
      items.sort((a, b) => b.title.localeCompare(a.title));
      break;
    default:
      items.sort((a, b) => b.createTime - a.createTime);
      break;
  }

  const total = items.length;
  const sliced = typeof limit === 'number'
    ? items.slice(offset, offset + limit)
    : items.slice(offset);

  return { data: sliced, total };
}

export async function isEntryFavorited(itemId?: string, link?: string | null): Promise<boolean> {
  const existing = await findFavoriteByEntry(itemId, link);
  return Boolean(existing);
}

export async function listAllFavorites(): Promise<FavoriteEntry[]> {
  return db.favorites.toArray();
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (Dexie as any).utils.getHexaDecimalRandomString(32);
}
