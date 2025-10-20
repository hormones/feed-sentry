<template>
  <BaseLayout
    class="rss-subscribe"
    :gap="12"
    :left-width="feedPaneWidth"
    :scrollable="{ left: true, middle: true }"
  >
    <template #left>
      <n-spin :show="loadingFeeds" class="rss-subscribe__feed-spin">
        <FeedList
          :feeds="feedItems"
          :active-id="activeFeedId"
          :keyword="feedKeyword"
          @select="handleSelectFeed"
        />
      </n-spin>
    </template>
    <template #middle>
      <div class="rss-subscribe__entries">
        <div class="rss-subscribe__entries-header">
          <n-space align="center" size="small">
            <n-text depth="3">
              {{ currentFeedLabel }}
            </n-text>
            <n-space align="center" size="small" class="rss-subscribe__filter-toggle">
              <span class="rss-subscribe__filter-label">{{ keywordFilterLabel }}</span>
              <n-switch
                size="small"
                :value="keywordFilterEnabled"
                :loading="loadingEntries"
                :disabled="keywordFilterDisabled"
                @update:value="handleKeywordFilterToggle"
              />
            </n-space>
          </n-space>
          <n-space size="small">
            <n-input
              v-model:value="entryKeyword"
              :placeholder="searchPlaceholder"
              clearable
              size="small"
              class="rss-subscribe__search"
            />
            <n-button
              size="small"
              tertiary
              :loading="markAllLoading"
              :disabled="loadingEntries || markAllLoading || !entryItems.length"
              @click="handleMarkAllRead"
            >
              {{ markAllLabel }}
            </n-button>
          </n-space>
        </div>
        <OptionsEntryTable
          class="rss-subscribe__entry-list"
          :entries="entryItems"
          :loading="loadingEntries"
          :highlight-keys="globalHighlightKeys"
          :feed-keyword-map="feedKeywordMap"
          :locale="tableLocale"
          :page="page"
          :page-size="pageSize"
          :page-sizes="pageSizeOptions"
          :total="total"
          :show-feed-column="activeFeedId === 'all'"
          @open-detail="handleOpenDetail"
          @toggle-favorite="handleToggleFavorite"
          @update:page="handlePageChange"
          @update:pageSize="handlePageSizeChange"
        />
      </div>
    </template>
  </BaseLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import browser from 'webextension-polyfill';
import type { EntryListItem } from '@/components/entry-list.types';
import type { FeedListItem } from '@/components';
import { BaseLayout, FeedList, OptionsEntryTable } from '@/components';
import type { Entry, Feed } from '@/services/db';
import {
  getAllFeeds,
  getUnreadCount,
  markAllAsRead,
  markEntryAsRead,
  queryEntries,
} from '@/services/feed-service';
import { toggleFavorite } from '@/services';
import { buildFeedKeywordMap } from '@/utils/highlight';
import useI18n from '@/composables/useI18n';
import { useSettingsStore } from '@/stores/settings';
import { useFavoritesStore } from '@/stores/favorites';
import { MessageType } from '@/constants';

const message = useMessage();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const favoritesStore = useFavoritesStore();

const rawFeeds = ref<Feed[]>([]);
const feedUnread = reactive<Record<string, number>>({ all: 0 });
const loadingFeeds = ref(false);
const feedKeyword = ref('');
const activeFeedId = ref<'all' | string>('all');
const keywordFilterEnabled = ref(false);

const entries = ref<Entry[]>([]);
const loadingEntries = ref(false);
const markAllLoading = ref(false);
const entryKeyword = ref('');
const page = ref(1);
const pageSize = ref(50);
const pageSizeOptions = [20, 50, 100];
const total = ref(0);
let entriesRequestId = 0;
const isInitializing = ref(true);

const feedPaneWidth = 300;

const searchPlaceholder = computed(() => t('options.rssSubscribe.searchPlaceholder'));
const markAllLabel = computed(() => t('options.rssSubscribe.actions.markAllRead'));
const keywordFilterLabel = computed(() => t('options.rssSubscribe.keywordFilter.label'));
const keywordFilterUnavailableMessage = computed(() => t('options.rssSubscribe.keywordFilter.unavailable'));
const tableLocale = computed(() => settingsStore.resolvedLocale);

const feedItems = computed<FeedListItem[]>(() => {
  const feeds = rawFeeds.value.map(feed => ({
    id: feed.id,
    title: feed.title,
    unread: feedUnread[feed.id] ?? 0,
    disabled: !feed.status,
    description: feed.link,
  }));
  return [
    {
      id: 'all',
      title: t('options.rssSubscribe.allFeeds'),
      unread: feedUnread.all ?? 0,
    },
    ...feeds,
  ];
});

const currentFeed = computed<Feed | undefined>(() =>
  rawFeeds.value.find(feed => feed.id === activeFeedId.value),
);

const currentFeedTitle = computed(() => {
  if (activeFeedId.value === 'all') {
    return t('options.rssSubscribe.allFeeds');
  }
  return currentFeed.value?.title ?? t('options.rssSubscribe.feedNotFound');
});

const currentFeedLabel = computed(() =>
  t('options.rssSubscribe.currentFeedLabel', { title: currentFeedTitle.value }),
);

const feedKeywordMap = computed(() => buildFeedKeywordMap(rawFeeds.value));
const entryItems = computed<EntryListItem[]>(() =>
  entries.value.map(entry => ({
    id: entry.id,
    title: entry.title ?? '',
    author: entry.author ?? '',
    feedId: entry.feedId,
    feedTitle: rawFeeds.value.find(feed => feed.id === entry.feedId)?.title ?? '',
    createTime: entry.createTime,
    isRead: entry.isRead,
    link: entry.link,
    keywords: entry.keywords ?? [],
    isFavorite: Boolean(entry.isFavorite),
    favoriteId: entry.favoriteId,
  })),
);

const globalHighlightKeys = computed(() => feedKeyword.value.split(/\s+/).filter(Boolean));

const keywordFilterDisabled = computed(() => {
  if (!rawFeeds.value.length) {
    return true;
  }
  if (activeFeedId.value === 'all') {
    return !rawFeeds.value.some(feed => feed.keywords.length > 0);
  }
  const targetFeed = currentFeed.value;
  return !targetFeed || targetFeed.keywords.length === 0;
});

function applyFavoriteSnapshot(): void {
  entries.value.forEach(entry => {
    entry.isFavorite = favoritesStore.hasByEntry(entry.id, entry.link ?? null);
  });
}

async function loadFeeds(): Promise<void> {
  loadingFeeds.value = true;
  try {
    const feeds = await getAllFeeds();
    rawFeeds.value = feeds;

    const feedUnreadEntries = await Promise.all(
      feeds.map(feed => getUnreadCount(feed.id)),
    );
    feeds.forEach((feed, index) => {
      feedUnread[feed.id] = feedUnreadEntries[index];
    });

    const totalUnread = await getUnreadCount('all');
    feedUnread.all = totalUnread;

    if (activeFeedId.value !== 'all' && !feeds.some(feed => feed.id === activeFeedId.value)) {
      activeFeedId.value = 'all';
    }
  } catch (error) {
    console.error('[Options] Failed to load feeds', error);
    message.error(t('options.rssSubscribe.messages.loadFeedsError'));
  } finally {
    loadingFeeds.value = false;
  }
}

async function loadEntries(): Promise<void> {
  loadingEntries.value = true;
  const requestId = ++entriesRequestId;
  try {
    const targetFeedId = activeFeedId.value;
    const result = await queryEntries(
      targetFeedId,
      {
        keyword: entryKeyword.value.trim(),
        page: page.value,
        pageSize: pageSize.value,
        keywordFilterEnabled: keywordFilterEnabled.value,
        keywordFilterMap: feedKeywordMap.value,
      },
    );

    if (requestId !== entriesRequestId) {
      return;
    }

    entries.value = result.data;
    total.value = result.total;
    applyFavoriteSnapshot();
  } catch (error) {
    console.error('[Options] Failed to load entries', error);
    message.error(t('options.rssSubscribe.messages.loadEntriesError'));
  } finally {
    if (requestId === entriesRequestId) {
      loadingEntries.value = false;
    }
  }
}

function handleKeywordFilterToggle(value: boolean): void {
  if (value && keywordFilterDisabled.value) {
    message.warning(keywordFilterUnavailableMessage.value);
    return;
  }
  keywordFilterEnabled.value = value;
}

async function handleMarkAllRead(): Promise<void> {
  if (markAllLoading.value) {
    return;
  }
  markAllLoading.value = true;
  try {
    const targetFeedId = activeFeedId.value;
    await markAllAsRead(targetFeedId);
    entries.value.forEach(entry => {
      if (targetFeedId === 'all' || entry.feedId === targetFeedId) {
        entry.isRead = true;
      }
    });
    await loadEntries();
    await loadFeeds();
    message.success(
      targetFeedId === 'all'
        ? t('options.rssSubscribe.messages.markAllAllSuccess')
        : t('options.rssSubscribe.messages.markAllFeedSuccess'),
    );
  } catch (error) {
    console.error('[Options] Failed to mark all entries as read', error);
    message.error(t('options.rssSubscribe.messages.markAllError'));
  } finally {
    markAllLoading.value = false;
  }
}

function handleSelectFeed(feed: FeedListItem): void {
  activeFeedId.value = feed.id;
}

function handlePageChange(value: number): void {
  page.value = value;
}

function handlePageSizeChange(value: number): void {
  pageSize.value = value;
  page.value = 1;
}

function adjustUnreadCount(feedId: string, delta: number): void {
  feedUnread.all = Math.max(0, (feedUnread.all ?? 0) + delta);
  if (feedUnread[feedId] !== undefined) {
    feedUnread[feedId] = Math.max(0, (feedUnread[feedId] ?? 0) + delta);
  }
}

async function handleOpenDetail(entry: EntryListItem): Promise<void> {
  if (!entry.link) {
    message.info(t('options.rssSubscribe.messages.missingLink'));
    return;
  }
  try {
    await browser.tabs.create({ url: entry.link });
    if (!entry.isRead) {
      await markEntryAsRead(entry.id);
      const target = entries.value.find(item => item.id === entry.id);
      if (target) {
        target.isRead = true;
        entry.isRead = true;
        adjustUnreadCount(target.feedId, -1);
      }
    }
  } catch (error) {
    console.error('[Options] Failed to open entry link', error);
    message.error(t('options.rssSubscribe.messages.openEntryError'));
  }
}

async function handleToggleFavorite(entry: EntryListItem): Promise<void> {
  const target = entries.value.find(item => item.id === entry.id);
  try {
    const result = await toggleFavorite({
      itemId: entry.id,
      link: entry.link ?? '',
      title: entry.title,
      source: 'subscription',
      createdFrom: 'options',
    });
    if (target) {
      target.isFavorite = result.isFavorite;
      target.favoriteId = result.favorite?.favoriteId;
    }
    await favoritesStore.refresh();
    applyFavoriteSnapshot();
    if (result.isFavorite) {
      message.success(t('options.entryTable.messages.favoriteAdded'));
    } else {
      message.info(t('options.entryTable.messages.favoriteRemoved'));
    }
  } catch (error) {
    console.error('[Options] Failed to toggle favorite', error);
    message.error(t('options.entryTable.messages.favoriteError'));
  }
}

function applyRouteState(): void {
  try {
    const url = new URL(window.location.href);
    const feedIdParam = url.searchParams.get('feedId');
    const keywordFilterParam = url.searchParams.get('keywordFilter');

    if (feedIdParam) {
      if (feedIdParam === 'all' || rawFeeds.value.some(feed => feed.id === feedIdParam)) {
        activeFeedId.value = feedIdParam === 'all' ? 'all' : feedIdParam;
      }
    }

    if (keywordFilterParam && ['1', 'true'].includes(keywordFilterParam.toLowerCase())) {
      keywordFilterEnabled.value = true;
    }

    if (['feedId', 'keywordFilter', 'keywords', 'entryLink'].some(param => url.searchParams.has(param))) {
      const paramsToRemove = ['feedId', 'keywordFilter', 'keywords', 'entryLink', 'view'];
      paramsToRemove.forEach(param => url.searchParams.delete(param));
      window.history.replaceState(null, '', url);
    }
  } catch (error) {
    console.error('[Options] Failed to apply route state', error);
  }
}

function setupFavoriteMessageListener(): void {
  const handler = (event: any) => {
    if (!event?.type) {
      return;
    }
    if (event.type === MessageType.FAVORITES_UPDATED || event.type === MessageType.FAVORITE_FOLDERS_UPDATED) {
      void favoritesStore.refresh().then(() => {
        applyFavoriteSnapshot();
      }).catch(error => {
        console.error('[Options] Failed to refresh favorites after message:', error);
      });
    }
  };
  browser.runtime.onMessage.addListener(handler);
  onBeforeUnmount(() => {
    browser.runtime.onMessage.removeListener(handler);
  });
}

watch(activeFeedId, () => {
  if (isInitializing.value) {
    return;
  }
  page.value = 1;
  loadEntries();
});

watch([page, pageSize], () => {
  if (isInitializing.value) {
    return;
  }
  loadEntries();
});

watch(entryKeyword, () => {
  if (isInitializing.value) {
    return;
  }
  page.value = 1;
  loadEntries();
});

watch(keywordFilterEnabled, () => {
  if (isInitializing.value) {
    return;
  }
  page.value = 1;
  loadEntries();
});

watch(keywordFilterDisabled, disabled => {
  if (disabled && keywordFilterEnabled.value) {
    keywordFilterEnabled.value = false;
  }
});

onMounted(async () => {
  await favoritesStore.initialize();
  setupFavoriteMessageListener();
  await loadFeeds();
  applyRouteState();
  await loadEntries();
  isInitializing.value = false;
});
</script>

<style scoped>
.rss-subscribe {
  min-height: 600px;
}

.rss-subscribe__feed-spin,
.rss-subscribe__entry-list {
  flex: 1;
  min-height: 0;
}

.rss-subscribe__feed-spin {
  width: 100%;
  align-self: stretch;
}

.rss-subscribe__entries {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.rss-subscribe__entries-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.rss-subscribe__filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rss-subscribe__filter-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.rss-subscribe__search {
  width: 200px;
}
</style>
