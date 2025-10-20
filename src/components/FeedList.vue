<template>
  <div class="feed-list">
    <div v-if="$slots.header" class="feed-list__header">
      <slot name="header" />
    </div>
    <n-spin :show="loading" class="feed-list__spin">
      <n-list
        class="feed-list__body"
        clickable
        hoverable
        bordered
      >
        <template v-if="renderedFeeds.length">
          <n-virtual-list
            class="feed-list__virtual"
            :items="renderedFeeds"
            :item-size="itemSize"
          >
            <template #default="{ item }">
              <n-list-item
                :class="['feed-list__item', { 'is-active': item.id === activeId, 'is-disabled': item.disabled }]"
                :disabled="item.disabled"
                @click="() => handleSelect(item)"
              >
                <n-space justify="space-between" align="center">
                  <div class="feed-list__title" v-html="item.highlightedTitle" />
                  <div class="feed-list__meta">
                    <slot name="meta" :item="item">
                      <n-tag
                        v-if="typeof item.unread === 'number' && item.unread > 0"
                        size="small"
                        type="info"
                        :bordered="false"
                      >
                        {{ item.unread }}
                      </n-tag>
                    </slot>
                  </div>
                </n-space>
              </n-list-item>
            </template>
          </n-virtual-list>
        </template>
        <template v-else>
          <n-empty class="feed-list__empty" :description="emptyDescription" />
        </template>
      </n-list>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { highlightText } from '@/utils/highlight';
import useI18n from '@/composables/useI18n';

export interface FeedListItem {
  id: string;
  title: string;
  unread?: number;
  disabled?: boolean;
  description?: string;
  [key: string]: unknown;
}

interface RenderedFeedListItem extends FeedListItem {
  highlightedTitle: string;
}

const props = withDefaults(defineProps<{
  feeds: FeedListItem[];
  activeId?: string;
  keyword?: string;
  loading?: boolean;
  itemSize?: number;
  filterOnKeyword?: boolean;
}>(), {
  feeds: () => [],
  keyword: '',
  loading: false,
  itemSize: 52,
  filterOnKeyword: true,
});

const emit = defineEmits<{
  (event: 'select', feed: FeedListItem): void;
}>();

const { t } = useI18n();

const normalizedKeyword = computed(() => props.keyword?.trim());

const filteredFeeds = computed<FeedListItem[]>(() => {
  if (!props.filterOnKeyword || !normalizedKeyword.value) {
    return props.feeds;
  }

  const keywordLower = normalizedKeyword.value.toLowerCase();
  return props.feeds.filter(feed => feed.title.toLowerCase().includes(keywordLower));
});

const renderedFeeds = computed<RenderedFeedListItem[]>(() =>
  filteredFeeds.value.map(feed => ({
    ...feed,
    highlightedTitle: highlightText(feed.title, normalizedKeyword.value),
  })),
);

const emptyDescription = computed(() => t('components.feedList.empty'));

function handleSelect(feed: FeedListItem) {
  if (feed.disabled) {
    return;
  }
  emit('select', feed);
}
</script>

<style scoped>
.feed-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.feed-list__header {
  margin-bottom: 8px;
}

.feed-list__spin,
.feed-list__body,
.feed-list__virtual {
  height: 100%;
}

.feed-list__body {
  padding: 0;
  overflow: hidden;
  border-radius: var(--n-border-radius);
}

.feed-list__virtual {
  display: block;
}

.feed-list__item {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.feed-list__item.is-active {
  background-color: var(--feed-list-active-bg, rgba(24, 160, 88, 0.16));
  color: var(--n-text-color);
}

.feed-list__item.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.feed-list__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-list__title mark {
  background-color: var(--feed-list-highlight-bg, rgba(24, 160, 88, 0.24));
  color: inherit;
}

.feed-list__meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.feed-list__empty {
  padding: 24px 0;
}
</style>

