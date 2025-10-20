import { computed, onBeforeUnmount, ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import {
  t as translate,
  type MessageParams,
  getCurrentLocale,
  subscribeLocaleChange,
} from '@/i18n';

export function useI18n() {
  const settingsStore = useSettingsStore();
  const locale = computed(() => settingsStore.locale);
  const localeSignal = ref(getCurrentLocale());

  const unsubscribe = subscribeLocaleChange(nextLocale => {
    localeSignal.value = nextLocale;
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
  });

  const t = (key: string, params?: MessageParams): string => {
    // Touch both signals to react to store updates and finalized locale swaps
    void locale.value;
    void localeSignal.value;
    return translate(key, params);
  };

  return {
    t,
    locale,
  };
}

export default useI18n;
