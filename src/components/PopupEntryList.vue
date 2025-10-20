<template>
  <div class="popup-entry-list">
    <div
      v-if="renderedItems.length"
      ref="scrollerRef"
      class="popup-entry-list__scroller"
      @scroll="handleScroll"
      >
        <div
          v-for="item in renderedItems"
          :key="item.id"
          class="popup-entry-list__card"
          :class="{
            'is-read': item.isRead,
            'is-favorite': item.isFavorite,
          }"
          @click="handleCardClick(item)"
        >
          <n-button
            :class="['popup-entry-list__favorite', { 'is-active': item.isFavorite }]"
            quaternary
            circle
            size="small"
            :aria-label="item.isFavorite ? unfavoriteLabel : favoriteLabel"
            @click.stop="handleFavoriteClick(item)"
          >
            <template #icon>
              <n-icon
                size="18"
                aria-hidden="true"
                :component="item.isFavorite ? Star : StarOutline"
              />
            </template>
          </n-button>
          <div class="popup-entry-list__card-header">
            <div class="popup-entry-list__title">
              <n-highlight
                :text="item.title"
                :patterns="item.patterns"
                :highlight-style="highlightStyle"
              />
            </div>
          </div>
          <div class="popup-entry-list__meta">
            <n-text depth="3">
              {{ item.feedTitle || feedUnknownLabel }}
            </n-text>
          <n-text depth="3">
            {{ formatTimestamp(item.createTime) }}
          </n-text>
        </div>
      </div>

      <div v-if="limitReached" class="popup-entry-list__status">
        <n-alert type="warning" show-icon :bordered="false" class="popup-entry-list__limit">
          {{ limitText }}
        </n-alert>
      </div>
      <div v-else-if="!hasMore" class="popup-entry-list__status">
        <n-text depth="3">{{ noMoreContentText }}</n-text>
      </div>
      <div v-else-if="loading" class="popup-entry-list__status">
        <n-spin size="small" />
      </div>
    </div>
    <n-empty v-else-if="!loading" :description="emptyDescription" />
    <div v-else class="popup-entry-list__loading">
      <n-spin size="small" />
    </div>

    <transition name="popup-entry-list-back-top-fade">
      <n-button
        v-if="showBackToTop"
        class="popup-entry-list__back-top"
        circle
        quaternary
        size="small"
        :aria-label="backToTopLabel"
        @click="scrollToTop"
      >
        <template #icon>
          <n-icon
            size="18"
            aria-hidden="true"
            :component="ChevronUpOutline"
          />
        </template>
      </n-button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronUpOutline, Star, StarOutline } from '@vicons/ionicons5';
import { useEntryHighlight } from '@/composables/useEntryHighlight';
import useI18n from '@/composables/useI18n';
import type { EntryListItem } from './entry-list.types';

const props = withDefaults(defineProps<{
  entries: EntryListItem[];
  loading?: boolean;
  highlightKeys?: string | string[];
  itemSize?: number;
  hasMore?: boolean;
  locale?: string;
  limitReached?: boolean;
  limitMessage?: string;
  feedKeywordMap?: Record<string, string[]>;
}>(), {
  entries: () => [],
  loading: false,
  highlightKeys: () => [],
  itemSize: 112,
  hasMore: false,
  locale: 'zh-CN',
  limitReached: false,
  limitMessage: undefined,
  feedKeywordMap: () => ({}),
});

const emit = defineEmits<{
  (event: 'open-detail', entry: EntryListItem): void;
  (event: 'load-more'): void;
  (event: 'scroll-change', position: number): void;
  (event: 'toggle-favorite', entry: EntryListItem): void;
}>();

const BACK_TOP_THRESHOLD = 1000;

const dateFormatter = computed(() => new Intl.DateTimeFormat(props.locale, {
  dateStyle: 'short',
  timeStyle: 'short',
}));

const { highlightStyle, renderedItems } = useEntryHighlight({
  entries: computed(() => props.entries),
  highlightKeys: computed(() => props.highlightKeys),
  feedKeywordMap: computed(() => props.feedKeywordMap),
});

const scrollerRef = ref<HTMLDivElement | null>(null);
const showBackToTop = ref(false);
const { t } = useI18n();

const feedUnknownLabel = computed(() => t('popup.entryList.labels.unknownFeed'));
const noMoreContentText = computed(() => t('popup.entryList.messages.noMore'));
const emptyDescription = computed(() => t('popup.entryList.messages.empty'));
const backToTopLabel = computed(() => t('popup.entryList.actions.backToTop'));
const limitText = computed(() => props.limitMessage ?? t('popup.entryList.messages.limitDefault'));
const favoriteLabel = computed(() => t('popup.entryList.actions.favorite'));
const unfavoriteLabel = computed(() => t('popup.entryList.actions.unfavorite'));

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return '--';
  }
  return dateFormatter.value.format(new Date(timestamp));
}

function handleScroll(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }

  emit('scroll-change', target.scrollTop);

  showBackToTop.value = target.scrollTop >= BACK_TOP_THRESHOLD;

  if (!props.hasMore || props.loading || props.limitReached) {
    return;
  }
  const distanceToBottom = target.scrollHeight - (target.scrollTop + target.clientHeight);
  if (distanceToBottom < 64) {
    emit('load-more');
  }
}

function getScrollTop(): number {
  return scrollerRef.value?.scrollTop ?? 0;
}

function scrollToPosition(position: number): void {
  if (!scrollerRef.value) {
    return;
  }
  scrollerRef.value.scrollTop = position;
  showBackToTop.value = position >= BACK_TOP_THRESHOLD;
}

function scrollToTop(): void {
  if (!scrollerRef.value) {
    return;
  }
  if (typeof scrollerRef.value.scrollTo === 'function') {
    scrollerRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    scrollerRef.value.scrollTop = 0;
  }
  showBackToTop.value = false;
  emit('scroll-change', 0);
}

defineExpose({
  getScrollTop,
  scrollToPosition,
});

function handleCardClick(entry: EntryListItem): void {
  emit('open-detail', entry);
}

function handleFavoriteClick(entry: EntryListItem): void {
  emit('toggle-favorite', entry);
}
</script>

<style scoped>
.popup-entry-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.popup-entry-list__scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  scrollbar-width: none;
}

.popup-entry-list__scroller::-webkit-scrollbar {
  display: none;
}

.popup-entry-list__card {
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color);
  cursor: pointer;
  transition: background-color 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.popup-entry-list__card:hover {
  background-color: rgba(24, 160, 88, 0.08);
}

.popup-entry-list__card.is-read {
  opacity: 0.6;
}

.popup-entry-list__card.is-favorite .popup-entry-list__title {
  color: var(--n-primary-color);
}

.popup-entry-list__card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.popup-entry-list__favorite {
  color: var(--n-text-color-3);
  transition: color 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
  position: absolute;
  top: 10px;
  right: 10px;
  opacity: 0;
  pointer-events: none;
  background-color: var(--n-color, rgba(255, 255, 255, 0.92));
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.16);
}

.popup-entry-list__favorite:hover {
  color: var(--n-primary-color-hover);
  transform: scale(1.05);
}

.popup-entry-list__favorite:active {
  transform: scale(0.96);
}

.popup-entry-list__favorite.is-active {
  color: var(--n-warning-color);
}

.popup-entry-list__card:hover .popup-entry-list__favorite,
.popup-entry-list__favorite:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-color-scheme: dark) {
  .popup-entry-list__favorite {
    background-color: rgba(17, 24, 39, 0.86);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
}

.popup-entry-list__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.popup-entry-list__status {
  padding: 12px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.popup-entry-list__limit {
  width: 100%;
}

.popup-entry-list__loading {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.popup-entry-list__back-top {
  position: absolute;
  right: 16px;
  bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
}

.popup-entry-list-back-top-fade-enter-active,
.popup-entry-list-back-top-fade-leave-active {
  transition: opacity 0.2s ease;
}

.popup-entry-list-back-top-fade-enter-from,
.popup-entry-list-back-top-fade-leave-to {
  opacity: 0;
}
</style>
