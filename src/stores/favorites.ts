import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import browser from 'webextension-polyfill';
import {
  listAllFavorites,
  type FavoriteEntry,
} from '@/services';
import { MessageType } from '@/constants';

interface FavoriteIndexEntry {
  favoriteId: string;
  folderId: string;
}

export const useFavoritesStore = defineStore('favorites', () => {
  const favorites = ref<FavoriteEntry[]>([]);
  const loading = ref(false);
  const initialized = ref(false);

  const favoriteIdMap = computed<Map<string, FavoriteIndexEntry>>(() => {
    const map = new Map<string, FavoriteIndexEntry>();
    favorites.value.forEach(item => {
      if (item.itemId) {
        map.set(item.itemId, {
          favoriteId: item.favoriteId,
          folderId: item.folderId,
        });
      }
    });
    return map;
  });

  const favoriteLinkMap = computed<Map<string, FavoriteIndexEntry>>(() => {
    const map = new Map<string, FavoriteIndexEntry>();
    favorites.value.forEach(item => {
      const link = item.link.trim();
      if (link) {
        map.set(link, {
          favoriteId: item.favoriteId,
          folderId: item.folderId,
        });
      }
    });
    return map;
  });

  const totalCount = computed(() => favorites.value.length);

  function hasByEntry(itemId?: string, link?: string | null): boolean {
    if (itemId && favoriteIdMap.value.has(itemId)) {
      return true;
    }
    const normalizedLink = link?.trim() ?? '';
    if (normalizedLink && favoriteLinkMap.value.has(normalizedLink)) {
      return true;
    }
    return false;
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      favorites.value = await listAllFavorites();
    } catch (error) {
      console.error('[Favorites Store] Failed to refresh favorites:', error);
    } finally {
      loading.value = false;
    }
  }

  function setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message: unknown) => {
      const payload = (message as { type?: string } | null | undefined);
      if (payload?.type === MessageType.FAVORITES_UPDATED || payload?.type === MessageType.FAVORITE_FOLDERS_UPDATED) {
        void refresh();
      }
    });
  }

  async function initialize(): Promise<void> {
    if (initialized.value) {
      return;
    }
    await refresh();
    setupMessageListener();
    initialized.value = true;
  }

  return {
    // state
    favorites,
    loading,
    initialized,

    // computed
    totalCount,

    // getters
    hasByEntry,

    // actions
    refresh,
    initialize,
  };
});
