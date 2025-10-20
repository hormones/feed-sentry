import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PopupRoot from './PopupRoot.vue';
import '../../styles/global.css';
import { initI18n, setLocale as setI18nLocale } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { resolveLocalePreference } from '@/utils/locale';

const app = createApp(PopupRoot);
const pinia = createPinia();
app.use(pinia);

const settingsStore = useSettingsStore(pinia);
await settingsStore.initialize();
await initI18n(settingsStore.locale);
document.documentElement.lang = resolveLocalePreference(settingsStore.locale);

settingsStore.$subscribe(async (_mutation, state) => {
  await setI18nLocale(state.locale);
  document.documentElement.lang = resolveLocalePreference(state.locale);
});

app.mount('#app');
