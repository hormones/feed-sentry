<template>
  <div class="popup-shell">
    <div class="popup-header" :style="popupHeaderStyle">
      <n-text strong>{{ t('app.name') }}</n-text>
      <n-button
        quaternary
        circle
        size="small"
        :aria-label="t('popup.app.actions.openOptions')"
        @click="openOptionsPage"
      >
        <template #icon>
          <n-icon
            size="18"
            aria-hidden="true"
            :component="SettingsOutline"
          />
        </template>
      </n-button>
    </div>
    <ViewSwitcher
      class="popup-switcher"
      v-model:model-value="activeView"
      :loading="feedsLoading || entriesLoading"
      :mark-all-disabled="markAllControlDisabled"
      @mark-all-read="handleMarkAllRead"
    />

    <div class="popup-content">
      <template v-if="activeView === 'all'">
        <PopupEntryList
          class="popup-content__entries"
          ref="entryListRef"
          :entries="entryItems"
          :loading="entriesLoading"
          :has-more="hasMoreEntries"
          :feed-keyword-map="feedKeywordMap"
          :item-size="96"
          :limit-reached="limitReached"
          :limit-message="limitMessage"
          @load-more="handleLoadMore"
          @scroll-change="handleScrollChange"
          @open-detail="handleOpenDetail"
          @toggle-favorite="handleFavoriteToggle"
        />
      </template>
      <template v-else>
        <div v-if="!selectedFeedId" class="popup-feed-selector">
          <div class="popup-feed-selector__list">
            <n-spin :show="feedsLoading">
              <FeedList
                :feeds="feedListItems"
                :active-id="feedListActiveId"
                @select="handleSelectFeed"
              />
            </n-spin>
          </div>
        </div>
        <div v-else class="popup-feed-detail">
          <n-space justify="space-between" align="center">
            <n-button size="small" quaternary @click="handleBackToFeedList">
              {{ t('popup.app.buttons.backToFeeds') }}
            </n-button>
            <n-space align="center" size="small">
              <n-text strong>{{ currentFeedTitle }}</n-text>
              <n-tag
                v-if="currentFeedUnread > 0"
                size="small"
                type="info"
                :bordered="false"
              >
                {{ t('popup.app.labels.unread') }} {{ currentFeedUnread }}
              </n-tag>
            </n-space>
          </n-space>
          <PopupEntryList
            class="popup-content__entries"
            ref="entryListRef"
            :entries="entryItems"
            :loading="entriesLoading"
            :has-more="hasMoreEntries"
            :feed-keyword-map="feedKeywordMap"
            :item-size="96"
            :limit-reached="limitReached"
          :limit-message="limitMessage"
          @load-more="handleLoadMore"
          @scroll-change="handleScrollChange"
          @open-detail="handleOpenDetail"
          @toggle-favorite="handleFavoriteToggle"
          />
        </div>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue';
import {useMessage, useThemeVars} from 'naive-ui';
import { SettingsOutline } from '@vicons/ionicons5';
import browser from 'webextension-polyfill';
import type {FeedListItem} from '@/components';
import {FeedList, PopupEntryList} from '@/components';
import type {EntryListItem} from '@/components/entry-list.types';
import type {Entry, Feed} from '@/services/db';
import {
  getAllFeeds,
  getUnreadCount,
  markAllAsRead,
  markEntryAsRead,
  queryEntriesInfinite,
} from '@/services/feed-service';
import {MessageType, STORAGE_KEYS, UI} from '@/constants';
import {buildFeedKeywordMap} from '@/utils/highlight';
import {resolveLocalePreference} from '@/utils/locale';
import { toggleFavorite } from '@/services';
import {useSettingsStore} from '@/stores/settings';
import { useFavoritesStore } from '@/stores/favorites';
import useI18n from '@/composables/useI18n';
import ViewSwitcher, {type ViewSwitcherValue} from './components/ViewSwitcher.vue';

interface EnrichedEntry extends EntryListItem {
  feedId: string;
  pubDate?: string | null;
}

interface ScrollSnapshot {
  scrollTop: number;
  topEntryId: string | null;
  topEntryCreateTime: number | null;
  loadedCount: number;
  updatedAt: number;
}

interface StoredViewState {
  activeView: ViewSwitcherValue;
  selectedFeedId: string | null;
}

const SCROLL_STORAGE_KEY = STORAGE_KEYS.POPUP_SCROLL_STATE;
const VIEW_STORAGE_KEY = STORAGE_KEYS.POPUP_VIEW_STATE;

const SCROLL_SAVE_DELAY = 250;

const settingsStore = useSettingsStore();
const message = useMessage();
const themeVars = useThemeVars();
const favoritesStore = useFavoritesStore();
const { t } = useI18n();

const popupHeaderStyle = computed(() => ({
  borderBottomColor: themeVars.value.dividerColor,
}));

const activeView = ref<ViewSwitcherValue>('all');
const feeds = ref<Feed[]>([]);
const selectedFeedId = ref<string | null>(null);
const entries = ref<EnrichedEntry[]>([]);
const hasMoreEntries = ref(false);
const entriesLoading = ref(false);
const feedsLoading = ref(false);
const lastCreateTime = ref<number | undefined>();
const feedUnread = reactive<Record<string, number>>({});
const entryListRef = ref<InstanceType<typeof PopupEntryList> | null>(null);
const scrollSnapshots = ref<Record<string, ScrollSnapshot>>({});
const latestScrollPositions = reactive<Record<string, number>>({});
const scrollSaveTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

const infiniteMax = UI.INFINITE_SCROLL_MAX;

const unreadTotal = computed(() => feedUnread.all ?? 0);

const feedListItems = computed<FeedListItem[]>(() =>
  feeds.value.map(feed => ({
    id: feed.id,
    title: feed.title,
    unread: feedUnread[feed.id] ?? 0,
    disabled: !feed.status,
  })),
);

const feedListActiveId = computed(() => selectedFeedId.value ?? undefined);

const currentFeed = computed(() =>
  selectedFeedId.value ? feeds.value.find(feed => feed.id === selectedFeedId.value) ?? null : null,
);

const currentFeedTitle = computed(() => currentFeed.value?.title ?? t('popup.app.labels.allFeeds'));
const currentFeedUnread = computed(() => (selectedFeedId.value ? feedUnread[selectedFeedId.value] ?? 0 : unreadTotal.value));

const currentUnreadCount = computed(() => {
  if (activeView.value === 'all') {
    return unreadTotal.value;
  }
  if (selectedFeedId.value) {
    return feedUnread[selectedFeedId.value] ?? 0;
  }
  return 0;
});

const markAllControlDisabled = computed(() =>
  (activeView.value === 'feeds' && !selectedFeedId.value) || currentUnreadCount.value === 0,
);

const entryItems = computed(() => entries.value);
const feedKeywordMap = computed(() => buildFeedKeywordMap(feeds.value));
const limitReached = computed(() => entries.value.length >= infiniteMax && !hasMoreEntries.value);
const limitMessage = computed(() => t('popup.app.messages.limitReached', { max: infiniteMax }));

let initialized = false;
let restoringScroll = false;

function getScrollKeyForState(
  view: ViewSwitcherValue = activeView.value,
  feedId: string | null = selectedFeedId.value,
): string | null {
  if (view === 'all') {
    return 'all';
  }
  if (view === 'feeds' && feedId) {
    return feedId;
  }
  return null;
}

async function loadPersistedState(): Promise<void> {
  try {
    const stored = await browser.storage.local.get([VIEW_STORAGE_KEY, SCROLL_STORAGE_KEY]);
    const viewState = stored[VIEW_STORAGE_KEY] as StoredViewState | undefined;
    if (viewState) {
      activeView.value = viewState.activeView === 'feeds' ? 'feeds' : 'all';
      selectedFeedId.value = typeof viewState.selectedFeedId === 'string' ? viewState.selectedFeedId : null;
    }

    const storedSnapshots = stored[SCROLL_STORAGE_KEY] as Record<string, ScrollSnapshot> | undefined;
    if (storedSnapshots) {
      scrollSnapshots.value = storedSnapshots;
      Object.keys(storedSnapshots).forEach(key => {
        latestScrollPositions[key] = storedSnapshots[key].scrollTop;
      });
    }
  } catch (error) {
    console.error('[Popup] Failed to load persisted state', error);
  }
}

async function persistViewState(): Promise<void> {
  const payload: StoredViewState = {
    activeView: activeView.value,
    selectedFeedId: selectedFeedId.value,
  };
  try {
    await browser.storage.local.set({
      [VIEW_STORAGE_KEY]: payload,
    });
  } catch (error) {
    console.error('[Popup] Failed to persist view state', error);
  }
}

async function persistScrollSnapshot(key: string): Promise<void> {
  cancelScrollSaveTimer(key);

  const scrollTop = latestScrollPositions[key] ?? 0;
  const snapshot: ScrollSnapshot = {
    scrollTop,
    topEntryId: entries.value[0]?.id ?? null,
    topEntryCreateTime: entries.value[0]?.createTime ?? null,
    loadedCount: entries.value.length,
    updatedAt: Date.now(),
  };

  const shouldStore = entries.value.length > 0;
  const nextSnapshots = { ...scrollSnapshots.value };

  if (shouldStore) {
    nextSnapshots[key] = snapshot;
    scrollSnapshots.value = nextSnapshots;
    latestScrollPositions[key] = scrollTop;
  } else {
    return;
  }

  try {
    await browser.storage.local.set({
      [SCROLL_STORAGE_KEY]: nextSnapshots,
    });
  } catch (error) {
    console.error('[Popup] Failed to persist scroll snapshot', error);
  }
}

async function removeScrollSnapshot(key: string): Promise<void> {
  cancelScrollSaveTimer(key);

  if (!(key in scrollSnapshots.value)) {
    return;
  }

  const nextSnapshots = { ...scrollSnapshots.value };
  delete nextSnapshots[key];
  scrollSnapshots.value = nextSnapshots;
  delete latestScrollPositions[key];

  try {
    await browser.storage.local.set({
      [SCROLL_STORAGE_KEY]: nextSnapshots,
    });
  } catch (error) {
    console.error('[Popup] Failed to remove scroll snapshot', error);
  }
}

async function persistCurrentScrollState(): Promise<void> {
  const key = getScrollKeyForState();
  if (!key) {
    return;
  }
  cancelScrollSaveTimer(key);
  await persistScrollSnapshot(key);
}

async function attemptRestoreScrollPosition(key: string, wasReset: boolean): Promise<void> {
  if (!wasReset || restoringScroll) {
    return;
  }

  const snapshot = scrollSnapshots.value[key];
  if (!snapshot) {
    return;
  }

  const topEntry = entries.value[0] ?? null;
  if (!topEntry) {
    await removeScrollSnapshot(key);
    return;
  }

  if (snapshot.topEntryId && topEntry.id !== snapshot.topEntryId) {
    await removeScrollSnapshot(key);
    return;
  }

  const snapshotTopTime = snapshot.topEntryCreateTime;
  const currentTopTime = typeof topEntry.createTime === 'number' ? topEntry.createTime : null;

  if (snapshotTopTime !== null && currentTopTime === null) {
    await removeScrollSnapshot(key);
    return;
  }

  if (
    snapshotTopTime !== null &&
    currentTopTime !== null &&
    currentTopTime > snapshotTopTime
  ) {
    await removeScrollSnapshot(key);
    return;
  }

  restoringScroll = true;
  try {
    const safetyLimit = 5;
    let attempt = 0;
    while (
      entries.value.length < snapshot.loadedCount &&
      hasMoreEntries.value &&
      attempt < safetyLimit
    ) {
      attempt += 1;
      await loadEntries({ reset: false, skipRestore: true });
    }

    latestScrollPositions[key] = snapshot.scrollTop;
    await nextTick();
    const listComponent = entryListRef.value;
    if (listComponent && typeof listComponent.scrollToPosition === 'function') {
      listComponent.scrollToPosition(snapshot.scrollTop);
    }
  } finally {
    restoringScroll = false;
  }
}

function handleScrollChange(position: number): void {
  const key = getScrollKeyForState();
  if (!key) {
    return;
  }
  latestScrollPositions[key] = position;
  if (!restoringScroll) {
    schedulePersistScrollSnapshot(key);
  }
}

function clearEntries(): void {
  entries.value = [];
  hasMoreEntries.value = false;
  lastCreateTime.value = undefined;
}

function applyFavoriteSnapshot(): void {
  entries.value.forEach(entry => {
    entry.isFavorite = favoritesStore.hasByEntry(entry.id, entry.link ?? null);
  });
}

function resolveTargetFeedId(): string | 'all' | null {
  if (activeView.value === 'all') {
    return 'all';
  }
  return selectedFeedId.value ?? null;
}

async function loadFeeds(): Promise<void> {
  feedsLoading.value = true;
  try {
    const result = await getAllFeeds({ activeOnly: true });
    feeds.value = result;

    const unreadList = await Promise.all(result.map(feed => getUnreadCount(feed.id)));
    feedUnread.all = await getUnreadCount('all', {activeOnly: true});
    result.forEach((feed, index) => {
      feedUnread[feed.id] = unreadList[index] ?? 0;
    });

    if (selectedFeedId.value && !result.some(feed => feed.id === selectedFeedId.value)) {
      const removedFeedId = selectedFeedId.value;
      selectedFeedId.value = null;
      clearEntries();
      void removeScrollSnapshot(removedFeedId);
    }

    if (!result.length && activeView.value === 'feeds') {
      activeView.value = 'all';
    }
  } catch (error) {
    console.error('[Popup] Failed to load feeds', error);
    message.error(t('popup.app.messages.loadFeedsError'));
  } finally {
    feedsLoading.value = false;
  }
}

async function refreshUnreadCounts(feedId?: string | 'all'): Promise<void> {
  try {
    feedUnread.all = await getUnreadCount('all', { activeOnly: true });
    if (feedId && feedId !== 'all') {
      feedUnread[feedId] = await getUnreadCount(feedId);
    } else if (!feedId) {
      const unreadList = await Promise.all(feeds.value.map(feed => getUnreadCount(feed.id)));
      feeds.value.forEach((feed, index) => {
        feedUnread[feed.id] = unreadList[index] ?? 0;
      });
    }
  } catch (error) {
    console.error('[Popup] Failed to refresh unread counts', error);
  }
}

async function loadEntries(options: { reset?: boolean; skipRestore?: boolean } = {}): Promise<void> {
  const targetFeedId = resolveTargetFeedId();
  if (!targetFeedId) {
    return;
  }

  if (entriesLoading.value) {
    return;
  }

  entriesLoading.value = true;
  try {
    if (options.reset) {
      clearEntries();
    }

    const result = await queryEntriesInfinite(targetFeedId, {
      limit: UI.INFINITE_SCROLL_LIMIT,
      maxTotal: UI.INFINITE_SCROLL_MAX,
      lastCreateTime: options.reset ? undefined : lastCreateTime.value,
      excludeInactiveFeeds: targetFeedId === 'all',
    });

    const feedTitleMap = feeds.value.reduce<Record<string, string>>((accumulator, feed) => {
      accumulator[feed.id] = feed.title;
      return accumulator;
    }, {});

    const mapped = result.data.map((entry: Entry) => ({
      id: entry.id,
      feedId: entry.feedId,
      title: entry.title,
      author: entry.author,
      feedTitle: feedTitleMap[entry.feedId] ?? t('popup.app.labels.unknownFeed'),
      createTime: entry.createTime,
      isRead: entry.isRead,
      link: entry.link,
      keywords: entry.keywords ?? [],
      isFavorite: Boolean(entry.isFavorite),
      favoriteId: entry.favoriteId,
      pubDate: entry.pubDate,
    }));

    if (options.reset) {
      entries.value = mapped;
    } else {
      const existingIds = new Set(entries.value.map(item => item.id));
      const merged = [...entries.value];
      mapped.forEach(item => {
        if (!existingIds.has(item.id)) {
          merged.push(item);
        }
      });
      entries.value = merged;
    }
    applyFavoriteSnapshot();

    hasMoreEntries.value = result.hasMore;
    if (entries.value.length > infiniteMax) {
      entries.value = entries.value.slice(0, infiniteMax);
    }
    if (entries.value.length >= infiniteMax) {
      hasMoreEntries.value = false;
    }
    lastCreateTime.value = entries.value.length
      ? entries.value[entries.value.length - 1]?.createTime
      : undefined;
  } catch (error) {
    console.error('[Popup] Failed to load entries', error);
    message.error(t('popup.app.messages.loadEntriesError'));
  } finally {
    entriesLoading.value = false;
  }

  if (!options.skipRestore && typeof targetFeedId === 'string') {
    await attemptRestoreScrollPosition(targetFeedId, options.reset === true);
  }
}

async function handleLoadMore(): Promise<void> {
  if (!hasMoreEntries.value) {
    return;
  }
  await loadEntries({ reset: false });
}

async function handleOpenDetail(entry: EntryListItem): Promise<void> {
  if (!entry.link) {
    message.info(t('popup.app.messages.missingLink'));
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
        await refreshUnreadCounts(target.feedId);
      } else {
        await refreshUnreadCounts(entry.feedId);
      }
    }
  } catch (error) {
    console.error('[Popup] Failed to open entry link', error);
    message.error(t('popup.app.messages.openLinkError'));
  }
}

async function handleFavoriteToggle(entry: EntryListItem): Promise<void> {
  const target = entries.value.find(item => item.id === entry.id);
  try {
    const result = await toggleFavorite({
      itemId: entry.id,
      link: entry.link ?? '',
      title: entry.title,
      source: 'subscription',
      createdFrom: 'popup',
    });
    if (target) {
      target.isFavorite = result.isFavorite;
      target.favoriteId = result.favorite?.favoriteId;
    }
    await favoritesStore.refresh();
    applyFavoriteSnapshot();
    if (result.isFavorite) {
      message.success(t('popup.entryList.messages.favoriteAdded'));
    } else {
      message.info(t('popup.entryList.messages.favoriteRemoved'));
    }
  } catch (error) {
    console.error('[Popup] Failed to toggle favorite', error);
    message.error(t('popup.entryList.messages.favoriteError'));
  }
}

async function handleMarkAllRead(): Promise<void> {
  const targetFeedId = resolveTargetFeedId();
  if (!targetFeedId) {
    return;
  }

  try {
    await markAllAsRead(targetFeedId);
    if (targetFeedId === 'all') {
      entries.value.forEach(entry => {
        entry.isRead = true;
      });
      await refreshUnreadCounts();
    } else {
      entries.value.forEach(entry => {
        if (entry.feedId === targetFeedId) {
          entry.isRead = true;
        }
      });
      await refreshUnreadCounts(targetFeedId);
    }
    message.success(t('popup.app.messages.markAllSuccess'));
  } catch (error) {
    console.error('[Popup] Failed to mark all as read', error);
    message.error(t('popup.app.messages.markAllFailure'));
  }
}
function handleSelectFeed(feed: FeedListItem): void {
  void persistCurrentScrollState();
  selectedFeedId.value = feed.id;
}

function handleBackToFeedList(): void {
  void persistCurrentScrollState();
  selectedFeedId.value = null;
}

function cancelScrollSaveTimer(key: string): void {
  const timer = scrollSaveTimers[key];
  if (timer !== undefined) {
    clearTimeout(timer);
    delete scrollSaveTimers[key];
  }
}

function schedulePersistScrollSnapshot(key: string): void {
  cancelScrollSaveTimer(key);
  scrollSaveTimers[key] = setTimeout(() => {
    delete scrollSaveTimers[key];
    void persistScrollSnapshot(key);
  }, SCROLL_SAVE_DELAY);
}

function cancelAllScrollSaveTimers(): void {
  Object.keys(scrollSaveTimers).forEach(cancelScrollSaveTimer);
}

async function openOptionsPage(): Promise<void> {
  try {
    await browser.runtime.openOptionsPage();
  } catch (error) {
    console.error('[Popup] Failed to open options page', error);
    message.error(t('popup.app.messages.openOptionsError'));
  }
}

async function refreshData(): Promise<void> {
  await loadFeeds();
  await loadEntries({ reset: true });
}

function setupMessageListener(): void {
  const handler = (messageEvent: any) => {
    if (!messageEvent || !messageEvent.type) {
      return;
    }

    switch (messageEvent.type) {
      case MessageType.ENTRIES_ADDED:
      case MessageType.SYNC_COMPLETED:
      case MessageType.FEED_UPDATED:
      case MessageType.FEED_DISABLED:
      case MessageType.BADGE_UPDATE:
        void refreshData();
        break;
      case MessageType.FAVORITES_UPDATED:
      case MessageType.FAVORITE_FOLDERS_UPDATED:
        void favoritesStore.refresh().then(() => {
          applyFavoriteSnapshot();
        }).catch(error => {
          console.error('[Popup] Failed to refresh favorites after message:', error);
        });
        break;
      default:
        break;
    }
  };

  browser.runtime.onMessage.addListener(handler);
  onBeforeUnmount(() => {
    browser.runtime.onMessage.removeListener(handler);
  });
}

watch(() => settingsStore.locale, locale => {
  document.documentElement.lang = resolveLocalePreference(locale);
}, { immediate: true });

watch(activeView, async (view, previous) => {
  if (!initialized) {
    return;
  }

  const previousView = (previous ?? view) as ViewSwitcherValue;
  const previousKey = getScrollKeyForState(previousView, selectedFeedId.value);
  if (previousKey) {
    await persistScrollSnapshot(previousKey);
  }

  if (view === 'all') {
    selectedFeedId.value = null;
    await loadEntries({ reset: true });
  } else if (view === 'feeds') {
    if (!feeds.value.length) {
      await loadFeeds();
    }
    if (selectedFeedId.value) {
      await loadEntries({ reset: true });
    } else {
      clearEntries();
    }
  }

  await persistViewState();
});

watch(selectedFeedId, async (newValue, oldValue) => {
  if (!initialized) {
    return;
  }

  const switchingToAllView = activeView.value === 'all' && newValue === null;

  if (oldValue && !switchingToAllView) {
    await persistScrollSnapshot(oldValue);
  }

  if (newValue) {
    await loadEntries({ reset: true });
  } else {
    clearEntries();
  }

  await persistViewState();
}, { flush: 'pre' });

onBeforeUnmount(() => {
  cancelAllScrollSaveTimers();
  void persistCurrentScrollState();
  void persistViewState();
});

onMounted(async () => {
  await settingsStore.initialize();
  await favoritesStore.initialize();
  await loadPersistedState();
  initialized = true;
  await loadFeeds();
  if (activeView.value === 'all') {
    await loadEntries({ reset: true });
  } else if (activeView.value === 'feeds') {
    if (selectedFeedId.value) {
      await loadEntries({ reset: true });
    } else {
      clearEntries();
    }
  }
  await persistViewState();
  setupMessageListener();
});
</script>

<style scoped>
.popup-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 16px;
  gap: 12px;
  box-sizing: border-box;
  background-color: var(--n-body-color);
  color: var(--n-text-color);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid transparent;
}

.popup-switcher {
  flex: 0 0 auto;
}

.popup-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.popup-content__entries {
  flex: 1;
  min-height: 0;
}

.popup-feed-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.popup-feed-selector__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.popup-feed-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}
</style>
