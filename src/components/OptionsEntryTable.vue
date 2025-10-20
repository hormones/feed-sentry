<template>
  <div class="options-entry-table">
    <n-data-table
      size="small"
      :bordered="false"
      :loading="loading"
      :columns="columns"
      :data="tableRows"
      :row-class-name="rowClassName"
      :scroll-x="760"
      class="options-entry__table"
    />
    <n-pagination
      class="options-entry-table__pagination"
      :page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :item-count="total"
      show-size-picker
      size="small"
      :disabled="loading"
      @update:page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { NHighlight, NButton, NIcon, type DataTableColumns } from 'naive-ui';
import { Star, StarOutline } from '@vicons/ionicons5';
import { useEntryHighlight } from '@/composables/useEntryHighlight';
import useI18n from '@/composables/useI18n';
import type { EntryListItem } from './entry-list.types';

const props = withDefaults(defineProps<{
  entries: EntryListItem[];
  loading?: boolean;
  highlightKeys?: string | string[];
  page: number;
  pageSize: number;
  pageSizes?: number[];
  total: number;
  locale?: string;
  feedKeywordMap?: Record<string, string[]>;
  showFeedColumn?: boolean;
}>(), {
  entries: () => [],
  loading: false,
  highlightKeys: () => [],
  page: 1,
  pageSize: 50,
  pageSizes: () => [20, 50, 100],
  total: 0,
  locale: 'zh-CN',
  feedKeywordMap: () => ({}),
  showFeedColumn: false,
});

const emit = defineEmits<{
  (event: 'open-detail', entry: EntryListItem): void;
  (event: 'update:page', page: number): void;
  (event: 'update:pageSize', pageSize: number): void;
  (event: 'toggle-favorite', entry: EntryListItem): void;
}>();

interface TableRow extends EntryListItem {
  patterns: string[];
  formattedTime: string;
  displayFeed: string;
}

const dateFormatter = computed(() => new Intl.DateTimeFormat(props.locale, {
  dateStyle: 'short',
  timeStyle: 'short',
}));

const { t } = useI18n();

const favoriteLabel = computed(() => t('options.entryTable.actions.favorite'));
const unfavoriteLabel = computed(() => t('options.entryTable.actions.unfavorite'));
const unknownFeedLabel = computed(() => t('options.entryTable.fallbacks.unknownFeed'));

const { highlightStyle, renderedItems } = useEntryHighlight({
  entries: computed(() => props.entries),
  highlightKeys: computed(() => props.highlightKeys),
  feedKeywordMap: computed(() => props.feedKeywordMap),
});

const tableRows = computed<TableRow[]>(() =>
  renderedItems.value.map(entry => ({
    ...entry,
    formattedTime: entry.createTime ? dateFormatter.value.format(new Date(entry.createTime)) : '--',
    displayFeed: entry.feedTitle?.trim() || unknownFeedLabel.value,
  })),
);

const columns = computed<DataTableColumns<TableRow>>(() => [
  {
    title: t('options.entryTable.columns.title'),
    key: 'title',
    minWidth: 240,
    ellipsis: true,
    render: row =>
      h(
        'span',
        {
          class: 'options-entry-table__title',
          onClick: () => emit('open-detail', row),
        },
        [
          h(NHighlight, {
            text: row.title,
            patterns: row.patterns,
            highlightStyle: highlightStyle.value,
          }),
        ],
      ),
  },
  ...(props.showFeedColumn
    ? [
        {
          title: t('options.entryTable.columns.feed'),
          key: 'displayFeed',
          width: 180,
          ellipsis: true,
          render: (row: TableRow) => row.displayFeed,
        } as const,
      ]
    : []),
  {
    title: t('options.entryTable.columns.author'),
    key: 'author',
    width: 160,
    ellipsis: true,
    render: row => row.author || t('options.entryTable.fallbacks.unknownAuthor'),
  },
  {
    title: t('options.entryTable.columns.time'),
    key: 'formattedTime',
    width: 160,
    render: row => row.formattedTime,
  },
  {
    title: t('options.entryTable.columns.operations'),
    key: 'operations',
    width: 80,
    align: 'center',
    render: row =>
      h(
        NButton,
        {
          quaternary: true,
          circle: true,
          size: 'small',
          class: ['options-entry-table__favorite-btn', row.isFavorite ? 'is-active' : ''],
          'aria-label': row.isFavorite ? unfavoriteLabel.value : favoriteLabel.value,
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            emit('toggle-favorite', row);
          },
        },
        {
          icon: () =>
            h(
              NIcon,
              { size: 18 },
              {
                default: () => h(row.isFavorite ? Star : StarOutline),
              },
            ),
        },
      ),
  },
]);

function rowClassName(row: TableRow): string {
  return row.isRead ? 'is-read' : 'is-unread';
}
</script>

<style scoped>
.options-entry-table {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.options-entry__table {
  overflow: auto;
}


.options-entry-table__title {
  cursor: pointer;
  color: var(--n-primary-color);
  text-decoration: none;
  transition: color 0.2s ease;
  display: inline-block;
}

.options-entry-table__title:hover {
  color: var(--n-primary-color-hover);
  text-decoration: underline;
}

.options-entry-table :deep(.is-read td) {
  opacity: 0.6;
}

.options-entry-table__favorite-btn {
  color: var(--n-text-color-3);
  transition: color 0.2s ease, transform 0.2s ease;
}

.options-entry-table__favorite-btn:hover {
  color: var(--n-primary-color-hover);
  transform: scale(1.1);
}

.options-entry-table__favorite-btn.is-active {
  color: var(--n-warning-color);
}

.options-entry-table__pagination {
  margin-top: 8px;
  align-self: flex-end;
}
</style>
