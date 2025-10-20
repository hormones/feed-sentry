<template>
  <div class="popup-root">
    <n-config-provider :theme="naiveTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
      <n-global-style />
      <n-message-provider>
        <App />
      </n-message-provider>
    </n-config-provider>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { darkTheme, zhCN, enUS, dateZhCN, dateEnUS } from 'naive-ui';
import App from './App.vue';
import { useSettingsStore } from '@/stores/settings';

const settingsStore = useSettingsStore();

const naiveTheme = computed(() => (settingsStore.isDarkMode ? darkTheme : null));
const naiveLocale = computed(() => (settingsStore.resolvedLocale === 'zh-CN' ? zhCN : enUS));
const naiveDateLocale = computed(() => (settingsStore.resolvedLocale === 'zh-CN' ? dateZhCN : dateEnUS));
</script>

<style scoped>
.popup-root {
  width: 420px;
  min-width: 320px;
  max-width: 420px;
  height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.n-config-provider) {
  height: 100%;
}
</style>
