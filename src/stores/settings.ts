import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import browser from 'webextension-polyfill';
import { MessageType, STORAGE_KEYS, DEFAULT_SETTINGS } from '@/constants';
import {
  resolveLocalePreference,
  detectSystemLocale,
  isLocalePreference,
  type LocalePreference,
  type ResolvedLocale,
} from '@/utils/locale';

// Theme types
export type Theme = 'light' | 'dark' | 'auto';

// Locale types
export type Locale = LocalePreference;

// Settings interface
export interface Settings {
  theme: Theme;
  locale: LocalePreference;
}

/**
 * Settings store for managing global application settings
 * Syncs with chrome.storage.local and broadcasts changes to all contexts
 */
export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref<Theme>(DEFAULT_SETTINGS.THEME);
  const locale = ref<LocalePreference>(DEFAULT_SETTINGS.LOCALE);
  const isLoading = ref(true);

  // Computed
  const resolvedLocale = computed<ResolvedLocale>(() => resolveLocalePreference(locale.value));

  const settings = computed<Settings>(() => ({
    theme: theme.value,
    locale: locale.value,
  }));

  const isDarkMode = computed(() => {
    if (theme.value === 'dark') {
      return true;
    }
    if (theme.value === 'light') {
      return false;
    }
    // Auto: detect system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  /**
   * Load settings from chrome.storage.local
   */
  async function loadSettings(): Promise<void> {
    try {
      isLoading.value = true;
      const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
      const storedSettings = result[STORAGE_KEYS.SETTINGS] as Settings | undefined;

      if (storedSettings) {
        theme.value = storedSettings.theme || DEFAULT_SETTINGS.THEME;
        locale.value = isLocalePreference(storedSettings.locale)
          ? storedSettings.locale
          : DEFAULT_SETTINGS.LOCALE;
        console.log('[Settings Store] Loaded settings:', storedSettings);
      } else {
        // Initialize with default settings
        locale.value = DEFAULT_SETTINGS.LOCALE;
        await saveSettings();
        console.log('[Settings Store] Initialized with default settings');
      }
    } catch (error) {
      console.error('[Settings Store] Load error:', error);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Save settings to chrome.storage.local
   */
  async function saveSettings(): Promise<void> {
    try {
      const settingsToSave: Settings = {
        theme: theme.value,
        locale: locale.value,
      };

      await browser.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: settingsToSave,
      });

      console.log('[Settings Store] Saved settings:', settingsToSave);

      // Broadcast settings change to all contexts
      await broadcastSettingsChange();
    } catch (error) {
      console.error('[Settings Store] Save error:', error);
    }
  }

  /**
   * Broadcast settings change to all extension contexts
   */
  async function broadcastSettingsChange(): Promise<void> {
    try {
      await browser.runtime.sendMessage({
        type: MessageType.SETTINGS_CHANGED,
        payload: settings.value,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Ignore if no listeners (this is expected in some contexts)
      if (error instanceof Error && !error.message.includes('Receiving end does not exist')) {
        console.error('[Settings Store] Broadcast error:', error);
      }
    }
  }

  /**
   * Update theme
   */
  async function setTheme(newTheme: Theme): Promise<void> {
    if (theme.value !== newTheme) {
      theme.value = newTheme;
      await saveSettings();
    }
  }

  /**
   * Update locale
   */
  async function setLocale(newLocale: LocalePreference): Promise<void> {
    if (locale.value !== newLocale) {
      locale.value = newLocale;
      await saveSettings();
      if (newLocale === 'system') {
        console.log('[Settings Store] Locale set to system preference:', detectSystemLocale());
      }
    }
  }

  /**
   * Update multiple settings at once
   */
  async function updateSettings(updates: Partial<Settings>): Promise<void> {
    let changed = false;

    if (updates.theme !== undefined && updates.theme !== theme.value) {
      theme.value = updates.theme;
      changed = true;
    }

    if (updates.locale !== undefined && updates.locale !== locale.value) {
      if (isLocalePreference(updates.locale)) {
        locale.value = updates.locale;
        changed = true;
        if (updates.locale === 'system') {
          console.log('[Settings Store] Locale set to system preference:', detectSystemLocale());
        }
      }
    }

    if (changed) {
      await saveSettings();
    }
  }

  /**
   * Reset to default settings
   */
  async function resetSettings(): Promise<void> {
    theme.value = DEFAULT_SETTINGS.THEME;
    locale.value = DEFAULT_SETTINGS.LOCALE;
    await saveSettings();
  }

  /**
   * Listen for storage changes from other contexts
   */
  function setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
        const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue as Settings;
        if (newSettings) {
          theme.value = newSettings.theme || DEFAULT_SETTINGS.THEME;
          locale.value = isLocalePreference(newSettings.locale)
            ? newSettings.locale
            : DEFAULT_SETTINGS.LOCALE;
          console.log('[Settings Store] Settings updated from storage:', newSettings);
        }
      }
    });
  }

  /**
   * Listen for settings messages from other contexts
   */
  function setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === MessageType.SETTINGS_CHANGED && message.payload) {
        const newSettings = message.payload as Settings;
        theme.value = newSettings.theme || DEFAULT_SETTINGS.THEME;
        locale.value = isLocalePreference(newSettings.locale)
          ? newSettings.locale
          : DEFAULT_SETTINGS.LOCALE;
        console.log('[Settings Store] Settings updated from message:', newSettings);
      }
    });
  }

  /**
   * Listen for system theme changes (for auto mode)
   */
  function setupThemeListener(): void {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        if (theme.value === 'auto') {
          console.log('[Settings Store] System theme changed:', e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  /**
   * Initialize store
   */
  async function initialize(): Promise<void> {
    await loadSettings();
    setupStorageListener();
    setupMessageListener();
    setupThemeListener();
    console.log('[Settings Store] Initialized');
  }

  return {
    // State
    theme,
    locale,
    isLoading,

    // Computed
    settings,
    isDarkMode,
    resolvedLocale,

    // Actions
    setTheme,
    setLocale,
    updateSettings,
    resetSettings,
    loadSettings,
    saveSettings,
    initialize,
    resolveLocalePreference,
    detectSystemLocale,
  };
});
