import '@/polyfills/global';
import browser from 'webextension-polyfill';
import { setupMessageListener, updateBadge } from './messaging';
import { restartPoller, startPoller, syncFeed, syncAllFeeds } from './rss-poller';
import { DEFAULT_SETTINGS, MessageType, STORAGE_KEYS } from '@/constants';
import { initI18n, setLocale as setI18nLocale } from '@/i18n';
import type { Settings } from '@/stores/settings';
import {
  resolveLocalePreference,
  isLocalePreference,
  type LocalePreference,
} from '@/utils/locale';

async function resolveInitialLocale(): Promise<LocalePreference> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEYS.SETTINGS) as Record<string, Settings | undefined>;
    const storedSettings = stored[STORAGE_KEYS.SETTINGS];
    const persistedLocale = storedSettings?.locale;
    if (isLocalePreference(persistedLocale)) {
      return persistedLocale;
    }
    return DEFAULT_SETTINGS.LOCALE;
  } catch (error) {
    console.error('[Background] Failed to resolve initial locale, falling back to default', error);
    return DEFAULT_SETTINGS.LOCALE;
  }
}

async function initBackground(): Promise<void> {
  const initialLocalePreference = await resolveInitialLocale();
  await initI18n(initialLocalePreference);

  console.info('[Background] Feed Sentry initializing', {
    id: browser.runtime.id,
    locale: resolveLocalePreference(initialLocalePreference),
  });

  // Sync locale when settings change
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
      const updatedSettings = changes[STORAGE_KEYS.SETTINGS].newValue as Settings | undefined;
      const newLocale = isLocalePreference(updatedSettings?.locale)
        ? updatedSettings!.locale
        : DEFAULT_SETTINGS.LOCALE;
      void setI18nLocale(newLocale);
    }
  });

  // Setup message listener
  setupMessageListener();

  // Setup custom message handlers
  browser.runtime.onMessage.addListener((message: any, _sender: any) => {
    if (message.type === MessageType.TRIGGER_SYNC) {
      const feedId = message.payload?.feedId;
      if (feedId) {
        return syncFeed(feedId);
      }
      return syncAllFeeds();
    }
    if (message.type === MessageType.FEED_UPDATED) {
      const requiresRestart = Boolean(message.payload?.requiresRestart);
      if (requiresRestart) {
        return restartPoller()
          .then(() => ({ success: true }))
          .catch(error => {
            console.error('[Background] Failed to restart poller after feed update:', error);
            return { success: false, error: (error as Error)?.message ?? 'restart failed' };
          });
      }
      return Promise.resolve({ success: true });
    }
    if (message.type === MessageType.SETTINGS_CHANGED && message.payload?.locale) {
      const newLocale = isLocalePreference(message.payload.locale)
        ? message.payload.locale
        : DEFAULT_SETTINGS.LOCALE;
      void setI18nLocale(newLocale);
    }
    return Promise.resolve();
  });

  // Start RSS poller
  startPoller().catch(error => {
    console.error('[Background] Failed to start RSS poller:', error);
  });

  // Initialize badge
  updateBadge().catch(error => {
    console.error('[Background] Failed to update badge:', error);
  });

  // Handle extension icon click (optional)
  browser.action.onClicked.addListener(() => {
    console.log('[Background] Extension icon clicked');
  });

  console.info('[Background] Feed Sentry ready');
}

export default {
  main() {
    void initBackground();
  },
};
