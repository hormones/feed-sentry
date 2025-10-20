<template>
  <n-config-provider :theme="naiveTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <div class="options-app">
          <n-layout class="options-app__frame">
            <n-layout-header bordered class="options-app__header">
              <div class="options-app__header-content">
                <span class="options-app__title">{{ t('options.layout.title') }}</span>
              </div>
            </n-layout-header>
            <n-layout has-sider class="options-app__main">
              <n-layout-sider width="200" bordered class="options-app__sider">
                <n-menu
                  v-model:value="activeMenu"
                  :options="menuOptions"
                  :collapsed-width="48"
                />
              </n-layout-sider>
              <n-layout-content class="options-app__content">
                <div class="options-app__content-inner">
                  <component :is="currentView" />
                </div>
              </n-layout-content>
            </n-layout>
          </n-layout>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue';
import type {MenuOption} from 'naive-ui';
import {darkTheme, dateEnUS, dateZhCN, enUS, zhCN} from 'naive-ui';
import {useSettingsStore} from '@/stores/settings';
import useI18n from '@/composables/useI18n';
import RssSubscribe from './views/RssSubscribe.vue';
import FavoritesManage from './views/FavoritesManage.vue';
import PluginSettings from './views/PluginSettings.vue';
import FeedManage from './views/FeedManage.vue';

const settingsStore = useSettingsStore();
const { t } = useI18n();

const viewMap = {
  rss: RssSubscribe,
  favorites: FavoritesManage,
  manage: FeedManage,
  settings: PluginSettings,
} as const;

type MenuKey = keyof typeof viewMap;

const menuOptions = computed<MenuOption[]>(() => [
  { label: t('options.menu.rss'), key: 'rss' },
  { label: t('options.menu.manage'), key: 'manage' },
  { label: t('options.menu.favorites'), key: 'favorites' },
  { label: t('options.menu.settings'), key: 'settings' },
]);

const activeMenu = ref<MenuKey>('rss');

const initialViewParam = new URLSearchParams(window.location.search).get('view');
if (initialViewParam && initialViewParam in viewMap) {
  activeMenu.value = initialViewParam as MenuKey;
}

const currentView = computed(() => viewMap[activeMenu.value]);

const naiveTheme = computed(() => (settingsStore.isDarkMode ? darkTheme : null));
const naiveLocale = computed(() => (settingsStore.resolvedLocale === 'zh-CN' ? zhCN : enUS));
const naiveDateLocale = computed(() => (settingsStore.resolvedLocale === 'zh-CN' ? dateZhCN : dateEnUS));
</script>

<style scoped>
.options-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  background-color: var(--n-body-color);
}

.options-app__frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.options-app__header {
  flex: 0 0 88px;
  display: flex;
  align-items: center;
  padding: 0 24px 16px;
  box-sizing: border-box;
}

.options-app__header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.options-app__title {
  font-size: 24px;
  font-weight: 600;
  color: var(--options-title-color);
}

.options-app__main {
  flex: 1;
  min-height: 0;
}

:deep(.n-layout-scroll-container) {
  display: flex;
  flex-direction: column;
}

.options-app__sider {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
}

.options-app__content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.options-app__content-inner {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  background-color: var(--options-content-background-color);
}
</style>
