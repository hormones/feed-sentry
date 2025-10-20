<template>
  <div class="plugin-settings">
    <n-space vertical size="large">
      <n-alert type="info" show-icon>
        {{ t('options.pluginSettings.alerts.syncHint') }}
      </n-alert>
      <PluginSettingsPanel
        :value="settingsValue"
        :loading="loading"
        @change="handleChange"
      >
        <n-divider />
        <n-space vertical size="small">
          <n-text depth="3">
            {{ t('options.pluginSettings.alerts.autoSave') }}
          </n-text>
        </n-space>
      </PluginSettingsPanel>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMessage } from 'naive-ui';
import { PluginSettingsPanel } from '@/components';
import { useSettingsStore, type Settings } from '@/stores/settings';
import useI18n from '@/composables/useI18n';

const settingsStore = useSettingsStore();
const message = useMessage();
const { t } = useI18n();

const settingsValue = computed(() => settingsStore.settings);
const loading = computed(() => settingsStore.isLoading);

type SettingsPayload = Partial<Settings>;

async function handleChange(value: SettingsPayload): Promise<void> {
  await settingsStore.updateSettings(value);
  message.success(t('options.pluginSettings.messages.updated'));
}
</script>

<style scoped>
.plugin-settings {
  padding: 16px;
}
</style>
