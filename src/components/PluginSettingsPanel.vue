<template>
  <n-card class="plugin-settings-panel" embedded :segmented="{ content: true, footer: false }">
    <n-form :model="formValue" label-placement="top" :disabled="loading" size="small">
      <section class="plugin-settings-panel__section">
        <n-divider title-placement="left">{{ t('options.pluginSettingsPanel.sectionTitle') }}</n-divider>
        <SettingSelect
          v-model:model-value="formValue.theme"
          :options="themeOptions"
          :label="t('options.pluginSettingsPanel.theme.label')"
          :placeholder="t('options.pluginSettingsPanel.theme.placeholder')"
        />
        <SettingSelect
          v-model:model-value="formValue.locale"
          :options="localeOptions"
          :label="t('options.pluginSettingsPanel.locale.label')"
          :placeholder="t('options.pluginSettingsPanel.locale.placeholder')"
        />
      </section>
      <slot />
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { SelectOption } from 'naive-ui';
import SettingSelect from './SettingSelect.vue';
import useI18n from '@/composables/useI18n';
import type { LocalePreference } from '@/utils/locale';

export interface SettingsValue {
  theme: 'light' | 'dark' | 'auto';
  locale: LocalePreference;
}

const props = withDefaults(defineProps<{
  value: SettingsValue;
  loading?: boolean;
}>(), {
  loading: false,
});

const emit = defineEmits<{
  (event: 'update:value', value: SettingsValue): void;
  (event: 'change', value: SettingsValue): void;
}>();

const formValue = reactive<SettingsValue>({ ...props.value });
const { t } = useI18n();

const themeOptions = computed<SelectOption[]>(() => [
  { label: t('options.pluginSettingsPanel.theme.options.auto'), value: 'auto' },
  { label: t('options.pluginSettingsPanel.theme.options.light'), value: 'light' },
  { label: t('options.pluginSettingsPanel.theme.options.dark'), value: 'dark' },
]);

const localeOptions = computed<SelectOption[]>(() => [
  { label: t('options.pluginSettingsPanel.locale.options.system'), value: 'system' },
  { label: t('options.pluginSettingsPanel.locale.options.zhCN'), value: 'zh-CN' },
  { label: t('options.pluginSettingsPanel.locale.options.en'), value: 'en' },
]);

watch(
  () => props.value,
  newValue => {
    Object.assign(formValue, newValue);
  },
  { deep: true },
);

watch(
  () => [formValue.theme, formValue.locale],
  () => {
    const nextValue: SettingsValue = {
      theme: formValue.theme,
      locale: formValue.locale,
    };
    emit('update:value', nextValue);
    emit('change', nextValue);
  },
);
</script>

<style scoped>
.plugin-settings-panel {
  width: 100%;
}

.plugin-settings-panel__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>



