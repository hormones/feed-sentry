<template>
  <div class="feed-manage">
    <n-space vertical size="large">
      <n-space justify="space-between" align="center">
        <n-input
          v-model:value="keyword"
          :placeholder="t('options.feedManage.searchPlaceholder')"
          clearable
          style="max-width: 280px"
        />
        <n-space size="small">
          <n-button type="primary" @click="openCreateDialog">
            {{ t('options.feedManage.actions.create') }}
          </n-button>
          <n-button secondary :loading="testNotificationLoading" @click="handleSendTestNotification">
            {{ t('options.feedManage.actions.testNotification') }}
          </n-button>
        </n-space>
      </n-space>
      <n-data-table
        :columns="columns"
        :data="filteredFeeds"
        :loading="loading"
        :row-key="rowKey"
        :bordered="false"
        class="feed-manage__table"
      />
    </n-space>
  </div>
  <FeedEditDialog
    v-model:visible="dialogVisible"
    :loading="dialogLoading"
    :initial-value="dialogInitialValue"
    @submit="handleSubmitDialog"
    @cancel="handleCancelDialog"
  />

  <n-modal
    v-model:show="deleteModal.visible"
    preset="dialog"
    :title="t('options.feedManage.modals.deleteTitle')"
    :negative-text="t('common.actions.cancel')"
    :positive-text="t('common.actions.delete')"
    :positive-button-props="{ loading: deleteModal.loading }"
    @positive-click="confirmDeleteFeed"
    @after-leave="resetDeleteModal"
  >
    <n-text depth="3">
      {{ t('options.feedManage.modals.deleteHint', { title: deleteModal.feedTitle || t('options.feedManage.columns.title') }) }}
    </n-text>
  </n-modal>
</template>

<script setup lang="ts">
import browser from 'webextension-polyfill';
import { computed, h, nextTick, onMounted, reactive, ref } from 'vue';
import {
  useMessage,
  useDialog,
  NButton,
  NSwitch,
  NTooltip,
  NIcon,
  NInputNumber,
} from 'naive-ui';
import type { InputNumberInst } from 'naive-ui';
import { CreateOutline, TrashOutline } from '@vicons/ionicons5';
import { FeedEditDialog } from '@/components';
import TagInput from '@/components/TagInput.vue';
import type { FeedFormValue } from '@/components';
import type { Feed } from '@/services/db';
import {
  getAllFeeds,
  getUnreadCount,
  addFeed,
  updateFeed,
  deleteFeed,
} from '@/services/feed-service';
import { hasFeedHostPermission, requestFeedHostPermission } from '@/services/permission-service';
import { MessageType } from '@/constants';
import useI18n from '@/composables/useI18n';

interface FeedRow extends Feed {
  unread: number;
}

const message = useMessage();
const dialog = useDialog();
const { t } = useI18n();
const keywordSnapshotMap = new Map<string, string[]>();

async function ensureFeedHostAccess(link: string): Promise<boolean> {
  const normalizedLink = link.trim();
  if (!normalizedLink) {
    return false;
  }
  const alreadyGranted = await hasFeedHostPermission(normalizedLink);
  if (alreadyGranted) {
    return true;
  }
  const granted = await requestFeedHostPermission(normalizedLink);
  if (!granted) {
    message.warning(t('options.feedManage.messages.permissionRequired'));
  }
  return granted;
}

const feeds = ref<FeedRow[]>([]);
const loading = ref(false);
const keyword = ref('');
const testNotificationLoading = ref(false);

const editingPollIntervalId = ref<string | null>(null);
const pollIntervalDraft = ref<number>(60);
const pollIntervalLoading = ref(false);
const pollIntervalInputRef = ref<InputNumberInst | null>(null);

const dialogVisible = ref(false);
const dialogLoading = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingFeedId = ref<string | null>(null);
const dialogInitialValue = ref<Partial<FeedFormValue>>({});

interface DeleteModalState {
  visible: boolean;
  loading: boolean;
  feedId: string | null;
  feedTitle: string;
}

const deleteModal = reactive<DeleteModalState>({
  visible: false,
  loading: false,
  feedId: null,
  feedTitle: '',
});

const filteredFeeds = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) {
    return feeds.value;
  }
  return feeds.value.filter(feed =>
    feed.title.toLowerCase().includes(value) ||
    feed.link.toLowerCase().includes(value),
  );
});

const renderEditIcon = () =>
  h(NIcon, { size: 16, component: CreateOutline, 'aria-hidden': 'true' });

const renderDeleteIcon = () =>
  h(NIcon, { size: 16, component: TrashOutline, 'aria-hidden': 'true' });

function openPollIntervalEditor(row: FeedRow): void {
  if (pollIntervalLoading.value) {
    return;
  }
  pollIntervalInputRef.value = null;
  editingPollIntervalId.value = row.id;
  pollIntervalDraft.value = row.pollInterval;
  void nextTick(() => {
    pollIntervalInputRef.value?.focus();
  });
}

function cancelPollIntervalEditor(): void {
  editingPollIntervalId.value = null;
  pollIntervalInputRef.value = null;
}

function handlePollIntervalDraftUpdate(value: number | null): void {
  if (typeof value === 'number') {
    pollIntervalDraft.value = value;
  }
}

async function commitPollInterval(row: FeedRow): Promise<void> {
  if (pollIntervalLoading.value) {
    return;
  }
  const nextValue = Math.round(pollIntervalDraft.value);
  if (!Number.isFinite(nextValue) || nextValue < 60) {
    message.warning(t('options.feedManage.validation.pollIntervalMin'));
    pollIntervalDraft.value = Math.max(60, row.pollInterval);
    void nextTick(() => {
      pollIntervalInputRef.value?.focus();
    });
    return;
  }
  if (nextValue === row.pollInterval) {
    cancelPollIntervalEditor();
    return;
  }
  pollIntervalLoading.value = true;
  try {
    await updateFeed(row.id, { pollInterval: nextValue });
    row.pollInterval = nextValue;
    pollIntervalDraft.value = nextValue;
    message.success(t('options.feedManage.messages.pollIntervalUpdated'));
    cancelPollIntervalEditor();
  } catch (error) {
    console.error('[Options] Failed to update poll interval', error);
    message.error(t('options.feedManage.messages.pollIntervalUpdateError'));
  } finally {
    pollIntervalLoading.value = false;
  }
}

function handlePollIntervalKeyup(event: KeyboardEvent, row: FeedRow): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    void commitPollInterval(row);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    pollIntervalDraft.value = row.pollInterval;
    cancelPollIntervalEditor();
  }
}

const columns = computed(() => [
  {
    title: t('options.feedManage.columns.title'),
    key: 'title',
    minWidth: 140,
    render: (row: FeedRow) => row.title,
  },
  {
    title: t('options.feedManage.columns.link'),
    key: 'link',
    minWidth: 200,
    render: (row: FeedRow) =>
      h(
        NButton,
        {
          text: true,
          tag: 'a',
          href: row.link,
          target: '_blank',
        },
        { default: () => row.link },
      ),
  },
  {
    title: t('options.feedManage.columns.pollInterval'),
    key: 'pollInterval',
    width: 120,
    render: (row: FeedRow) => {
      if (editingPollIntervalId.value === row.id) {
        return h(NInputNumber, {
          ref: pollIntervalInputRef,
          value: pollIntervalDraft.value,
          min: 60,
          step: 60,
          disabled: pollIntervalLoading.value,
          size: 'small',
          showButton: false,
          onUpdateValue: (value: number | null) => handlePollIntervalDraftUpdate(value),
          onBlur: () => void commitPollInterval(row),
          onKeyup: (event: KeyboardEvent) => handlePollIntervalKeyup(event, row),
        });
      }
      return h(
        'span',
        {
          class: 'feed-manage__poll-interval-display',
          role: 'button',
          tabindex: 0,
          onClick: () => openPollIntervalEditor(row),
          onKeyup: (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPollIntervalEditor(row);
            }
          },
        },
        row.pollInterval.toString(),
      );
    },
  },
  {
    title: t('options.feedManage.columns.notify'),
    key: 'notify',
    width: 100,
    render: (row: FeedRow) =>
      h(NSwitch, {
        size: 'small',
        value: row.notify,
        onUpdateValue: (value: boolean) => handleToggleNotify(row, value),
      }),
  },
  {
    title: t('options.feedManage.columns.keywords'),
    key: 'keywords',
    render: (row: FeedRow) =>
      h(TagInput, {
        modelValue: row.keywords,
        placeholder: t('options.feedManage.keywords.placeholder'),
        max: 10,
        'onUpdate:modelValue': (value: string[]) => handleKeywordsModelUpdate(row, value),
        onChange: (value: string[]) => handleKeywordsChange(row, value),
      }),
  },
  {
    title: t('options.feedManage.columns.keywordNotify'),
    key: 'keywordNotify',
    width: 100,
    render: (row: FeedRow) =>
      h(NSwitch, {
        size: 'small',
        value: row.keywordNotify,
        onUpdateValue: (value: boolean) => handleToggleKeywordNotify(row, value),
      }),
  },
  {
    title: t('options.feedManage.columns.unread'),
    key: 'unread',
    width: 80,
    render: (row: FeedRow) => row.unread,
  },
  {
    title: t('options.feedManage.columns.status'),
    key: 'status',
    width: 100,
    render: (row: FeedRow) =>
      h(NSwitch, {
        size: 'small',
        value: row.status,
        onUpdateValue: (value: boolean) => handleToggleStatus(row, value),
      }),
  },
  {
    title: t('options.feedManage.columns.actions'),
    key: 'actions',
    width: 120,
    render: (row: FeedRow) =>
      h(
        'div',
        { class: 'feed-manage__actions' },
        [
          h(
            NTooltip,
            { placement: 'bottom' },
            {
              trigger: () =>
                h(
                  NButton,
                  {
                    quaternary: true,
                    circle: true,
                    size: 'small',
                    'aria-label': t('options.feedManage.actions.editAria'),
                    onClick: () => openEditDialog(row),
                  },
                  {
                    icon: renderEditIcon,
                  },
                ),
              default: () => t('options.feedManage.tooltips.edit'),
            },
          ),
      h(
        NTooltip,
        { placement: 'bottom' },
        {
          trigger: () =>
            h(
              NButton,
              {
                quaternary: true,
                circle: true,
                size: 'small',
                type: 'error',
                'aria-label': t('options.feedManage.actions.deleteAria'),
                onClick: () => promptDelete(row),
              },
              {
                icon: renderDeleteIcon,
              },
            ),
          default: () => t('common.actions.delete'),
        },
      ),
        ],
      ),
  },
]);

function handleKeywordsModelUpdate(row: FeedRow, value: string[]): void {
  const previous = Array.isArray(row.keywords) ? [...row.keywords] : [];
  keywordSnapshotMap.set(row.id, previous);
  if (value.length > previous.length) {
    row.keywords = [...value];
  } else {
    row.keywords = [...previous];
  }
}

function handleKeywordsChange(row: FeedRow, value: string[]): void {
  const previous = keywordSnapshotMap.get(row.id) ?? [];
  keywordSnapshotMap.delete(row.id);

  const added = value.filter(tag => !previous.includes(tag));
  const removed = previous.filter(tag => !value.includes(tag));

  if (removed.length) {
    const keywordsText = removed.join(t('options.feedManage.keywords.separator'));
    dialog.warning({
      title: t('options.feedManage.confirmations.removeKeywords.title'),
      content: t('options.feedManage.confirmations.removeKeywords.content', { keywords: keywordsText }),
      positiveText: t('common.actions.delete'),
      negativeText: t('common.actions.cancel'),
      maskClosable: false,
      onPositiveClick: async () => {
        row.keywords = [...value];
        await persistKeywords(
          row,
          value,
          previous,
          added.length ? t('options.feedManage.messages.keywordsUpdated') : t('options.feedManage.messages.keywordsRemoved'),
        );
      },
      onNegativeClick: () => {
        row.keywords = [...previous];
      },
    });
    return;
  }

  if (added.length) {
    void persistKeywords(row, value, previous, t('options.feedManage.messages.keywordsAdded'));
    return;
  }

  row.keywords = [...previous];
}

async function persistKeywords(
  row: FeedRow,
  value: string[],
  previous: string[],
  successMessage: string,
): Promise<void> {
  try {
    await updateFeed(row.id, { keywords: value });
    row.keywords = [...value];
    message.success(successMessage);
  } catch (error) {
    console.error('[Options] Failed to update feed keywords', error);
    row.keywords = [...previous];
    message.error(t('options.feedManage.messages.keywordsUpdateError'));
  }
}

function rowKey(row: FeedRow): string {
  return row.id;
}

async function handleSendTestNotification(): Promise<void> {
  if (testNotificationLoading.value) {
    return;
  }

  const sampleFeed = feeds.value.find(feed => feed.keywordNotify && feed.keywords.length > 0);
  const keywords = sampleFeed?.keywords?.filter(Boolean) ?? [];

  testNotificationLoading.value = true;
  try {
    await browser.runtime.sendMessage({
      type: MessageType.TEST_NOTIFICATION,
      payload: {
        source: sampleFeed?.title,
        keywords,
      },
      timestamp: Date.now(),
    });
    message.success(t('options.feedManage.messages.testNotificationSuccess'));
  } catch (error) {
    console.error('[Options] Failed to send test notification', error);
    message.error(t('options.feedManage.messages.testNotificationError'));
  } finally {
    testNotificationLoading.value = false;
  }
}

async function loadFeeds(): Promise<void> {
  loading.value = true;
  try {
    const result = await getAllFeeds();
    const unreadList = await Promise.all(result.map(feed => getUnreadCount(feed.id)));
    keywordSnapshotMap.clear();
    feeds.value = result.map((feed, index) => ({
      ...feed,
      unread: unreadList[index] ?? 0,
    }));
    editingPollIntervalId.value = null;
    pollIntervalInputRef.value = null;
  } catch (error) {
    console.error('[Options] Failed to load feed table', error);
    message.error(t('options.feedManage.messages.loadError'));
  } finally {
    loading.value = false;
  }
}

function openCreateDialog(): void {
  dialogMode.value = 'create';
  editingFeedId.value = null;
  dialogInitialValue.value = {};
  dialogVisible.value = true;
}

function openEditDialog(feed: FeedRow): void {
  dialogMode.value = 'edit';
  editingFeedId.value = feed.id;
  dialogInitialValue.value = {
    title: feed.title,
    link: feed.link,
    pollInterval: feed.pollInterval,
    notify: feed.notify,
    keywords: [...feed.keywords],
    keywordNotify: feed.keywordNotify,
  };
  dialogVisible.value = true;
}

async function handleSubmitDialog(value: FeedFormValue): Promise<void> {
  dialogLoading.value = true;
  try {
    if (dialogMode.value === 'create') {
      const permissionGranted = await ensureFeedHostAccess(value.link);
      if (!permissionGranted) {
        return;
      }
      await addFeed({
        title: value.title,
        link: value.link,
        pollInterval: value.pollInterval,
        notify: value.notify,
        keywords: value.keywords,
        keywordNotify: value.keywordNotify,
      });
      message.success(t('options.feedManage.messages.createSuccess'));
    } else if (dialogMode.value === 'edit' && editingFeedId.value) {
      await updateFeed(editingFeedId.value, {
        title: value.title,
        pollInterval: value.pollInterval,
        notify: value.notify,
        keywords: value.keywords,
        keywordNotify: value.keywordNotify,
      });
      message.success(t('options.feedManage.messages.updateSuccess'));
    }
    dialogVisible.value = false;
    await loadFeeds();
  } catch (error) {
    console.error('[Options] Failed to submit feed dialog', error);
    message.error(
      dialogMode.value === 'create'
        ? t('options.feedManage.messages.createError')
        : t('options.feedManage.messages.updateError'),
    );
  } finally {
    dialogLoading.value = false;
  }
}

function handleCancelDialog(): void {
  dialogVisible.value = false;
}

async function handleToggleStatus(row: FeedRow, value: boolean): Promise<void> {
  if (value) {
    const permissionGranted = await ensureFeedHostAccess(row.link);
    if (!permissionGranted) {
      return;
    }
  }
  try {
    await updateFeed(row.id, { status: value });
    row.status = value;
    message.success(
      value ? t('options.feedManage.messages.statusEnabled') : t('options.feedManage.messages.statusDisabled'),
    );
  } catch (error) {
    console.error('[Options] Failed to toggle feed status', error);
    message.error(t('options.feedManage.messages.statusError'));
  }
}

async function handleToggleNotify(row: FeedRow, value: boolean): Promise<void> {
  try {
    await updateFeed(row.id, { notify: value });
    row.notify = value;
    message.success(
      value ? t('options.feedManage.messages.notifyEnabled') : t('options.feedManage.messages.notifyDisabled'),
    );
  } catch (error) {
    console.error('[Options] Failed to toggle feed notify', error);
    message.error(t('options.feedManage.messages.notifyError'));
  }
}

async function handleToggleKeywordNotify(row: FeedRow, value: boolean): Promise<void> {
  try {
    await updateFeed(row.id, { keywordNotify: value });
    row.keywordNotify = value;
    message.success(
      value
        ? t('options.feedManage.messages.keywordNotifyEnabled')
        : t('options.feedManage.messages.keywordNotifyDisabled'),
    );
  } catch (error) {
    console.error('[Options] Failed to toggle feed keyword notify', error);
    message.error(t('options.feedManage.messages.keywordNotifyError'));
  }
}

function promptDelete(row: FeedRow): void {
  deleteModal.feedId = row.id;
  deleteModal.feedTitle = row.title;
  deleteModal.visible = true;
}

function resetDeleteModal(): void {
  deleteModal.feedId = null;
  deleteModal.feedTitle = '';
  deleteModal.loading = false;
}

async function confirmDeleteFeed(): Promise<boolean> {
  if (!deleteModal.feedId) {
    deleteModal.visible = false;
    return true;
  }

  deleteModal.loading = true;
  try {
    await deleteFeed(deleteModal.feedId);
    message.success(t('options.feedManage.messages.deleteSuccess'));
    await loadFeeds();
    deleteModal.visible = false;
    return true;
  } catch (error) {
    console.error('[Options] Failed to delete feed', error);
    message.error(t('options.feedManage.messages.deleteError'));
    return false;
  } finally {
    deleteModal.loading = false;
  }
}

onMounted(() => {
  loadFeeds();
});
</script>

<style scoped>
.feed-manage {
  padding: 16px;
}

.feed-manage__table {
  overflow: auto;
}

.feed-manage__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.feed-manage__poll-interval-display {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.feed-manage__poll-interval-display:hover {
  text-decoration: underline;
}

.feed-manage__poll-interval-display:focus {
  outline: none;
  text-decoration: underline;
}
</style>
