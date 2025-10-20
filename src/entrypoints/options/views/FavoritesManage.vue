<template>
  <BaseLayout
    class="favorites-manage"
    :gap="12"
    :left-width="300"
    :scrollable="{ left: true, middle: true }"
  >
    <template #left>
      <n-space vertical size="small" class="favorites-manage__sidebar">
        <n-space justify="space-between" align="center">
          <n-text strong>{{ t('options.favorites.sidebar.title') }}</n-text>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="tiny"
                quaternary
                circle
                @click="openCreateFolderModal"
                :title="t('options.favorites.actions.newFolder')"
                :aria-label="t('options.favorites.actions.newFolder')"
              >
                <template #icon>
                  <n-icon :component="AddOutline" size="16" aria-hidden="true" />
                </template>
              </n-button>
            </template>
            {{ t('options.favorites.actions.newFolder') }}
          </n-tooltip>
        </n-space>
        <n-spin :show="foldersLoading">
          <div class="favorites-manage__folder-list">
            <div
              v-for="folder in folders"
              :key="folder.folderId"
              class="favorites-manage__folder-item"
              :class="{ 'is-active': folder.folderId === selectedFolderId }"
              @click="selectFolder(folder.folderId)"
            >
              <div class="favorites-manage__folder-main">
                <n-text class="favorites-manage__folder-name" :strong="folder.folderId === selectedFolderId">
                  {{ folder.displayName }}
                </n-text>
                <n-tag v-if="!folder.isSynthetic && folder.isDefault" size="small" type="success" :bordered="false">
                  {{ t('options.favorites.labels.defaultFolder') }}
                </n-tag>
              </div>
              <div class="favorites-manage__folder-meta">
                <n-tag
                  v-if="folder.total > 0"
                  size="small"
                  type="info"
                  :bordered="false"
                >
                  {{ folder.total }}
                </n-tag>
                <template v-if="folder.isSynthetic">
                  <n-button quaternary circle size="tiny" disabled>
                    <template #icon>
                      <n-icon
                        size="16"
                        :component="EllipsisVertical"
                      />
                    </template>
                  </n-button>
                </template>
                <n-dropdown
                  v-else
                  trigger="click"
                  size="small"
                  placement="bottom-end"
                  :options="getFolderActions(folder)"
                  @select="key => handleFolderAction(key as FolderAction, folder)"
                >
                  <n-button quaternary circle size="tiny" @click.stop>
                    <template #icon>
                      <n-icon
                        size="16"
                        :component="EllipsisVertical"
                      />
                    </template>
                  </n-button>
                </n-dropdown>
              </div>
            </div>
            <n-empty
              v-if="folders.length <= 1 && !foldersLoading"
              class="favorites-manage__folder-empty"
              :description="t('options.favorites.messages.noFolders')"
            />
          </div>
        </n-spin>
      </n-space>
    </template>
    <template #middle>
      <n-card class="favorites-manage__content" :title="currentFolderTitle">
        <template #header-extra>
          <n-space size="small" align="center">
            <n-button
              size="small"
              type="primary"
              @click="openManualModal"
            >
              {{ t('options.favorites.actions.addLink') }}
            </n-button>
            <n-input
              v-model:value="keyword"
              size="small"
              clearable
              :placeholder="t('options.favorites.search.placeholder')"
              style="width: 220px"
            />
            <n-select
              v-model:value="moveTargetFolderId"
              size="small"
              :options="moveTargetOptions"
              style="width: 180px"
              :placeholder="t('options.favorites.move.placeholder')"
            />
            <n-button
              size="small"
              tertiary
              :disabled="!selectedRowKeys.length || !moveTargetFolderId"
              @click="handleMoveSelected"
            >
              {{ t('options.favorites.actions.moveSelected') }}
            </n-button>
            <n-button
              size="small"
              type="error"
              secondary
              :disabled="!selectedRowKeys.length"
              @click="promptRemoveFavorites"
            >
              {{ t('options.favorites.actions.removeSelected') }}
            </n-button>
          </n-space>
        </template>
        <n-spin :show="favoritesLoading">
          <n-data-table
            :columns="columns"
            :data="tableRows"
            :row-key="rowKey"
            :row-props="rowProps"
            v-model:checked-row-keys="selectedRowKeys"
            :bordered="false"
            size="small"
            class="favorites-manage__table"
          />
          <n-empty
            v-if="!favoritesLoading && !tableRows.length"
            class="favorites-manage__empty"
            :description="t('options.favorites.messages.empty')"
          />
        </n-spin>
      </n-card>
    </template>
  </BaseLayout>

  <n-modal
    v-model:show="folderModal.visible"
    preset="dialog"
    :title="folderModal.mode === 'create'
      ? t('options.favorites.modals.createTitle')
      : t('options.favorites.modals.renameTitle')"
    :negative-text="t('common.actions.cancel')"
    :positive-text="t('common.actions.save')"
    @positive-click="submitFolderModal"
  >
    <n-input
      v-model:value="folderModal.name"
      :placeholder="t('options.favorites.modals.namePlaceholder')"
      @keydown.enter.prevent="submitFolderModal"
    />
  </n-modal>

  <n-modal
    v-model:show="deleteModal.visible"
    preset="dialog"
    :title="t('options.favorites.modals.deleteTitle')"
    :negative-text="t('common.actions.cancel')"
    :positive-text="t('options.favorites.modals.deleteConfirm')"
    @positive-click="confirmDeleteFolder"
  >
    <n-space v-if="deleteModal.requiresStrategy" vertical size="small">
      <n-text depth="3">
        {{ t('options.favorites.modals.deleteHint', { name: deleteModal.folderName }) }}
      </n-text>
      <n-radio-group v-model:value="deleteModal.strategy">
        <n-radio value="move-to-default">
          {{ t('options.favorites.modals.deleteMoveToDefault') }}
        </n-radio>
        <n-radio value="delete-all">
          {{ t('options.favorites.modals.deleteRemoveAll') }}
        </n-radio>
      </n-radio-group>
    </n-space>
    <n-text v-else depth="3">
      {{ t('options.favorites.modals.deleteEmptyHint', { name: deleteModal.folderName }) }}
    </n-text>
  </n-modal>

  <n-modal
    v-model:show="removeModal.visible"
    preset="dialog"
    :title="t('options.favorites.modals.removeTitle')"
    :negative-text="t('common.actions.cancel')"
    :positive-text="t('options.favorites.modals.removeConfirm')"
    :positive-button-props="{ loading: removeModal.loading }"
    @positive-click="confirmRemoveFavorites"
    @after-leave="resetRemoveModal"
  >
    <n-text depth="3">
      {{ t(
        removeModal.targetIds.length > 1
          ? 'options.favorites.modals.removeHintMultiple'
          : 'options.favorites.modals.removeHintSingle',
        { count: removeModal.targetIds.length },
      ) }}
    </n-text>
  </n-modal>

  <n-modal
    v-model:show="manualModal.visible"
    preset="dialog"
    :title="t('options.favorites.manual.title')"
    :negative-text="t('common.actions.cancel')"
    :positive-text="t('common.actions.save')"
    :positive-button-props="{ loading: manualModal.loading }"
    @positive-click="submitManualModal"
    @after-leave="resetManualModal"
  >
    <n-form label-placement="top">
      <n-form-item :label="t('options.favorites.manual.fields.title')">
        <n-input
          v-model:value="manualModal.title"
          :placeholder="t('options.favorites.manual.placeholders.title')"
        />
      </n-form-item>
      <n-form-item :label="t('options.favorites.manual.fields.link')">
        <n-input
          v-model:value="manualModal.link"
          :placeholder="t('options.favorites.manual.placeholders.link')"
        />
      </n-form-item>
      <n-form-item
        v-if="folderSelectOptions.length"
        :label="t('options.favorites.manual.fields.folder')"
      >
        <n-select
          v-model:value="manualModal.folderId"
          :options="folderSelectOptions"
          size="small"
        />
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { AddOutline, EllipsisVertical, TrashOutline } from '@vicons/ionicons5';
import { useMessage, NButton, NIcon, NTag, NTooltip, type DataTableColumns, type DropdownOption } from 'naive-ui';
import browser from 'webextension-polyfill';
import { BaseLayout } from '@/components';
import {
  listFavoriteFolders,
  listFavorites,
  listAllFavorites,
  createFavoriteFolder,
  renameFavoriteFolder,
  deleteFavoriteFolder,
  moveFavorites,
  removeFavorites,
  addFavorite,
  getDefaultFavoriteFolder,
  type FavoriteEntry,
  type FavoriteFolderWithCount,
} from '@/services';
import { useFavoritesStore } from '@/stores/favorites';
import { useSettingsStore } from '@/stores/settings';
import useI18n from '@/composables/useI18n';
import { MessageType } from '@/constants';

const ALL_FOLDER_ID = 'all';

type FolderAction = 'rename' | 'delete';
type DeleteStrategy = 'move-to-default' | 'delete-all';

interface FavoriteFolderItem extends FavoriteFolderWithCount {
  displayName: string;
  isSynthetic?: boolean;
}

interface FavoriteRow extends FavoriteEntry {
  displayDate: string;
  displayLink: string;
  displaySource: string;
  displayFolder: string;
}

interface DeleteModalState {
  visible: boolean;
  folderId: string;
  folderName: string;
  strategy: DeleteStrategy;
  requiresStrategy: boolean;
}

interface RemoveFavoritesModalState {
  visible: boolean;
  targetIds: string[];
  loading: boolean;
}

interface ManualFavoriteModalState {
  visible: boolean;
  loading: boolean;
  title: string;
  link: string;
  folderId: string | null;
}

const { t } = useI18n();
const message = useMessage();
const favoritesStore = useFavoritesStore();
const settingsStore = useSettingsStore();

const folders = ref<FavoriteFolderItem[]>([]);
const foldersLoading = ref(false);
const favorites = ref<FavoriteEntry[]>([]);
const favoritesLoading = ref(false);

const selectedFolderId = ref<string>(ALL_FOLDER_ID);
const keyword = ref('');
const selectedRowKeys = ref<string[]>([]);
const moveTargetFolderId = ref<string | null>(null);

const folderModal = reactive({
  visible: false,
  mode: 'create' as 'create' | 'rename',
  folderId: '' as string,
  name: '',
});

const deleteModal = reactive<DeleteModalState>({
  visible: false,
  folderId: '' as string,
  folderName: '',
  strategy: 'move-to-default' as DeleteStrategy,
  requiresStrategy: false,
});

const removeModal = reactive<RemoveFavoritesModalState>({
  visible: false,
  targetIds: [],
  loading: false,
});

const manualModal = reactive<ManualFavoriteModalState>({
  visible: false,
  loading: false,
  title: '',
  link: '',
  folderId: null,
});

watch(keyword, () => {
  void loadFavorites();
});

const dateFormatter = computed(() => new Intl.DateTimeFormat(settingsStore.resolvedLocale, {
  dateStyle: 'short',
  timeStyle: 'short',
}));

const currentFolder = computed(() =>
  folders.value.find(folder => folder.folderId === selectedFolderId.value) ?? null,
);

const currentFolderTitle = computed(() => {
  if (!currentFolder.value) {
    return t('options.favorites.headers.empty');
  }
  if (currentFolder.value.folderId === ALL_FOLDER_ID) {
    return t('options.favorites.headers.all');
  }
  return t('options.favorites.headers.currentFolder', { name: currentFolder.value.displayName });
});

const moveTargetOptions = computed(() =>
  folders.value
    .filter(folder => !folder.isSynthetic && folder.folderId !== selectedFolderId.value)
    .map(folder => ({
      label: folder.displayName,
      value: folder.folderId,
    })),
);

const folderSelectOptions = computed(() =>
  folders.value
    .filter(folder => !folder.isSynthetic)
    .map(folder => ({
      label: folder.displayName,
      value: folder.folderId,
    })),
);

const folderNameMap = computed(() => {
  const map = new Map<string, string>();
  folders.value.forEach(folder => {
    if (!folder.isSynthetic) {
      map.set(folder.folderId, folder.displayName);
    }
  });
  return map;
});

const tableRows = computed<FavoriteRow[]>(() =>
  favorites.value.map(item => {
    const normalizedLink = item.link.trim();
    return {
      ...item,
      displayDate: dateFormatter.value.format(new Date(item.createTime)),
      displayLink: normalizedLink || t('options.favorites.fallbacks.missingLink'),
      displaySource:
        item.source === 'manual'
          ? t('options.favorites.sources.manual')
          : t('options.favorites.sources.subscription'),
      displayFolder: folderNameMap.value.get(item.folderId) ?? t('options.favorites.fallbacks.unknownFolder'),
    };
  }),
);

const showFolderColumn = computed(() => selectedFolderId.value === ALL_FOLDER_ID);

const columns = computed<DataTableColumns<FavoriteRow>>(() => [
  {
    type: 'selection',
    multiple: true,
  },
  {
    title: t('options.favorites.columns.title'),
    key: 'title',
    minWidth: 240,
    ellipsis: true,
    render: row => row.title,
  },
  {
    title: t('options.favorites.columns.link'),
    key: 'displayLink',
    minWidth: 240,
    ellipsis: true,
    render: row => row.displayLink,
  },
  {
    title: t('options.favorites.columns.source'),
    key: 'displaySource',
    width: 140,
    ellipsis: true,
    render: row => row.displaySource,
  },
  ...(showFolderColumn.value
    ? [
        {
          title: t('options.favorites.columns.folder'),
          key: 'displayFolder',
          width: 160,
          ellipsis: true,
          render: (row: FavoriteRow) => row.displayFolder,
        } as const,
      ]
    : []),
  {
    title: t('options.favorites.columns.addedAt'),
    key: 'displayDate',
    width: 180,
    render: row => row.displayDate,
  },
  {
    title: t('options.favorites.columns.actions'),
    key: 'actions',
    width: 80,
    align: 'center',
    render: row =>
      h(
        NButton,
        {
          quaternary: true,
          circle: true,
          size: 'tiny',
          type: 'error',
          class: 'favorites-manage__row-button',
          title: t('options.favorites.actions.removeSingle'),
          'aria-label': t('options.favorites.actions.removeSingle'),
          onClick: () => promptRemoveFavorites([row.favoriteId]),
        },
        {
          icon: () =>
            h(NIcon, {
              size: 16,
              component: TrashOutline,
              'aria-hidden': 'true',
            }),
        },
      ),
  },
]);

const rowProps = (row: FavoriteRow) => ({
  onDblclick: () => {
    void openFavorite(row);
  },
  ...(row.link ? { style: { cursor: 'pointer' } } : {}),
});

function rowKey(row: FavoriteRow): string {
  return row.favoriteId;
}

function getFolderActions(folder: FavoriteFolderItem): DropdownOption[] {
  if (folder.isSynthetic) {
    return [];
  }
  const actions: DropdownOption[] = [
    {
      label: t('options.favorites.folderActions.rename'),
      key: 'rename',
    },
  ];

  if (!folder.isDefault) {
    actions.push({
      label: t('options.favorites.folderActions.delete'),
      key: 'delete',
    });
  }

  return actions;
}

function handleFolderAction(action: FolderAction, folder: FavoriteFolderItem): void {
  if (folder.isSynthetic) {
    return;
  }
  if (action === 'rename') {
    openRenameFolderModal(folder);
  } else if (action === 'delete') {
    openDeleteFolderModal(folder);
  }
}

function selectFolder(folderId: string): void {
  if (selectedFolderId.value === folderId) {
    return;
  }
  selectedFolderId.value = folderId;
  moveTargetFolderId.value = null;
  void loadFavorites();
}

function openCreateFolderModal(): void {
  folderModal.mode = 'create';
  folderModal.folderId = '';
  folderModal.name = '';
  folderModal.visible = true;
}

function openRenameFolderModal(folder: FavoriteFolderItem): void {
  if (folder.isSynthetic) {
    return;
  }
  folderModal.mode = 'rename';
  folderModal.folderId = folder.folderId;
  folderModal.name = folder.displayName;
  folderModal.visible = true;
}

function openDeleteFolderModal(folder: FavoriteFolderItem): void {
  if (folder.isSynthetic) {
    return;
  }
  deleteModal.folderId = folder.folderId;
  deleteModal.folderName = folder.displayName;
  deleteModal.requiresStrategy = folder.total > 0;
  deleteModal.strategy = deleteModal.requiresStrategy ? 'move-to-default' : 'delete-all';
  deleteModal.visible = true;
}

async function submitFolderModal(): Promise<void> {
  const name = folderModal.name.trim();
  if (!name) {
    message.warning(t('options.favorites.messages.folderNameRequired'));
    return;
  }

  try {
    if (folderModal.mode === 'create') {
      const folder = await createFavoriteFolder(name);
      folderModal.visible = false;
      message.success(t('options.favorites.messages.folderCreated'));
      await loadFolders(folder.folderId);
    } else {
      await renameFavoriteFolder(folderModal.folderId, name);
      folderModal.visible = false;
      message.success(t('options.favorites.messages.folderRenamed'));
      await loadFolders(folderModal.folderId);
    }
  } catch (error) {
    console.error('[Favorites Manage] Folder modal submit error:', error);
    message.error(t('options.favorites.messages.folderSaveFailed'));
  }
}

async function confirmDeleteFolder(): Promise<void> {
  try {
    const strategy = deleteModal.requiresStrategy ? deleteModal.strategy : 'delete-all';
    await deleteFavoriteFolder(deleteModal.folderId, strategy);
    deleteModal.visible = false;
    deleteModal.requiresStrategy = false;
    message.success(t('options.favorites.messages.folderDeleted'));
    await loadFolders();
    await loadFavorites();
  } catch (error) {
    console.error('[Favorites Manage] Delete folder error:', error);
    message.error(t('options.favorites.messages.folderDeleteFailed'));
  }
}

async function handleMoveSelected(): Promise<void> {
  if (!selectedRowKeys.value.length || !moveTargetFolderId.value) {
    return;
  }
  if (moveTargetFolderId.value === selectedFolderId.value) {
    message.warning(t('options.favorites.messages.moveSameFolder'));
    return;
  }

  try {
    await moveFavorites(selectedRowKeys.value, moveTargetFolderId.value);
    message.success(t('options.favorites.messages.moveSuccess'));
    selectedRowKeys.value = [];
    await loadFolders();
    await loadFavorites();
  } catch (error) {
    console.error('[Favorites Manage] Move favorites error:', error);
    message.error(t('options.favorites.messages.moveFailed'));
  }
}

function promptRemoveFavorites(ids?: string[] | Event): void {
  const targetIds = Array.isArray(ids) ? ids : selectedRowKeys.value;
  if (!targetIds.length) {
    return;
  }
  removeModal.targetIds = [...targetIds];
  removeModal.visible = true;
}

function resetRemoveModal(): void {
  removeModal.targetIds = [];
  removeModal.loading = false;
}

async function confirmRemoveFavorites(): Promise<boolean> {
  if (!removeModal.targetIds.length) {
    removeModal.visible = false;
    return true;
  }

  removeModal.loading = true;
  try {
    await removeFavorites(removeModal.targetIds);
    message.success(t('options.favorites.messages.removeSuccess'));
    selectedRowKeys.value = selectedRowKeys.value.filter(id => !removeModal.targetIds.includes(id));
    await loadFolders();
    await loadFavorites();
    removeModal.visible = false;
    return true;
  } catch (error) {
    console.error('[Favorites Manage] Remove favorites error:', error);
    message.error(t('options.favorites.messages.removeFailed'));
    return false;
  } finally {
    removeModal.loading = false;
  }
}

function openManualModal(): void {
  manualModal.title = '';
  manualModal.link = '';
  manualModal.loading = false;
  const preferredFolder =
    selectedFolderId.value !== ALL_FOLDER_ID ? selectedFolderId.value : null;
  const fallbackFolder =
    folders.value.find(folder => !folder.isSynthetic && folder.folderId === preferredFolder)?.folderId ??
    folders.value.find(folder => !folder.isSynthetic && folder.isDefault)?.folderId ??
    folders.value.find(folder => !folder.isSynthetic)?.folderId ??
    null;
  manualModal.folderId = fallbackFolder;
  manualModal.visible = true;
}

function resetManualModal(): void {
  manualModal.title = '';
  manualModal.link = '';
  manualModal.folderId = null;
  manualModal.loading = false;
}

async function submitManualModal(): Promise<boolean> {
  const title = manualModal.title.trim();
  const link = manualModal.link.trim();

  if (!title) {
    message.warning(t('options.favorites.validation.manualTitleRequired'));
    return false;
  }

  if (!link) {
    message.warning(t('options.favorites.validation.manualLinkRequired'));
    return false;
  }

  let normalizedLink: string;
  try {
    normalizedLink = new URL(link).toString();
  } catch {
    message.warning(t('options.favorites.validation.manualLinkInvalid'));
    return false;
  }

  manualModal.loading = true;
  try {
    const favorite = await addFavorite({
      title,
      link: normalizedLink,
      folderId: manualModal.folderId ?? undefined,
      source: 'manual',
      createdFrom: 'options',
    });
    const preferredFolderId = selectedFolderId.value === ALL_FOLDER_ID ? ALL_FOLDER_ID : favorite.folderId;
    await loadFolders(preferredFolderId);
    await loadFavorites();
    await favoritesStore.refresh();
    message.success(t('options.favorites.messages.manualAddSuccess'));
    return true;
  } catch (error) {
    console.error('[Favorites Manage] Add manual favorite error:', error);
    message.error(t('options.favorites.messages.manualAddFailed'));
    return false;
  } finally {
    manualModal.loading = false;
  }
}

async function openFavorite(row: FavoriteRow): Promise<void> {
  const normalizedLink = row.link.trim();
  if (!normalizedLink) {
    message.warning(t('options.favorites.messages.missingLink'));
    return;
  }
  try {
    await browser.tabs.create({ url: normalizedLink });
  } catch (error) {
    console.error('[Favorites Manage] Failed to open favorite link:', error);
    message.error(t('options.favorites.messages.openLinkFailed'));
  }
}

async function loadFolders(preferredId?: string): Promise<void> {
  foldersLoading.value = true;
  try {
    const realFolders = await listFavoriteFolders();
    const totalCount = realFolders.reduce((sum, folder) => sum + folder.total, 0);
    const mappedFolders: FavoriteFolderItem[] = realFolders.map(folder => ({
      ...folder,
      displayName: folder.name,
      isSynthetic: false,
    }));
    const allFolder: FavoriteFolderItem = {
      folderId: ALL_FOLDER_ID,
      name: ALL_FOLDER_ID,
      displayName: t('options.favorites.sidebar.all'),
      isDefault: false,
      order: -1,
      createTime: 0,
      updateTime: 0,
      total: totalCount,
      isSynthetic: true,
    };
    folders.value = [allFolder, ...mappedFolders];

    const availableIds = new Set(folders.value.map(folder => folder.folderId));
    let nextSelection: string | undefined;

    if (preferredId && availableIds.has(preferredId)) {
      nextSelection = preferredId;
    } else if (availableIds.has(selectedFolderId.value)) {
      nextSelection = selectedFolderId.value;
    } else if (mappedFolders.length) {
      const defaultFolder = mappedFolders.find(folder => folder.isDefault);
      nextSelection = defaultFolder?.folderId ?? mappedFolders[0].folderId;
    }

    selectedFolderId.value = nextSelection ?? ALL_FOLDER_ID;
  } catch (error) {
    console.error('[Favorites Manage] Load folders error:', error);
    message.error(t('options.favorites.messages.loadFoldersFailed'));
  } finally {
    foldersLoading.value = false;
  }
}

async function loadFavorites(): Promise<void> {
  favoritesLoading.value = true;
  try {
    const trimmedKeyword = keyword.value.trim().toLowerCase();
    if (selectedFolderId.value === ALL_FOLDER_ID) {
      let data = await listAllFavorites();
      if (trimmedKeyword) {
        data = data.filter(item => {
          const title = item.title.toLowerCase();
          const link = item.link.toLowerCase();
          return title.includes(trimmedKeyword) || link.includes(trimmedKeyword);
        });
      }
      data.sort((a, b) => b.createTime - a.createTime);
      favorites.value = data;
      selectedRowKeys.value = selectedRowKeys.value.filter(id =>
        data.some(item => item.favoriteId === id),
      );
    } else {
      const { data } = await listFavorites(selectedFolderId.value, {
        keyword: trimmedKeyword || undefined,
        sort: 'createTime-desc',
      });
      favorites.value = data;
      selectedRowKeys.value = selectedRowKeys.value.filter(id =>
        data.some(item => item.favoriteId === id),
      );
    }
  } catch (error) {
    console.error('[Favorites Manage] Load favorites error:', error);
    message.error(t('options.favorites.messages.loadFavoritesFailed'));
  } finally {
    favoritesLoading.value = false;
  }
}

function setupMessageListener(): void {
  const handler = (event: any) => {
    if (!event?.type) {
      return;
    }
    if (event.type === MessageType.FAVORITES_UPDATED || event.type === MessageType.FAVORITE_FOLDERS_UPDATED) {
      void refreshData();
    }
  };
  browser.runtime.onMessage.addListener(handler);
  onBeforeUnmount(() => {
    browser.runtime.onMessage.removeListener(handler);
  });
}

async function refreshData(): Promise<void> {
  await loadFolders();
  await loadFavorites();
}

onMounted(async () => {
  await favoritesStore.initialize();
  await getDefaultFavoriteFolder();
  await loadFolders();
  await loadFavorites();
  setupMessageListener();
});
</script>

<style scoped>
.favorites-manage {
  min-height: 600px;
}

.favorites-manage__sidebar {
  height: 100%;
}

.favorites-manage__folder-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.favorites-manage__folder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background-color 0.2s ease, color 0.2s ease;
  cursor: pointer;
}

.favorites-manage__folder-item:hover {
  background-color: rgba(24, 160, 88, 0.08);
}

.favorites-manage__folder-item.is-active {
  background-color: rgba(24, 160, 88, 0.12);
  color: var(--n-primary-color);
}

.favorites-manage__folder-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.favorites-manage__folder-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorites-manage__folder-meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.favorites-manage__folder-empty {
  margin-top: 24px;
}

.favorites-manage__content {
  flex: 1;
  min-height: 0;
}

.favorites-manage__table {
  min-height: 320px;
}

.favorites-manage__empty {
  margin-top: 48px;
}

.favorites-manage__row-button {
  color: var(--n-error-color);
}

.favorites-manage__row-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

</style>
