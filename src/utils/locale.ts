import { DEFAULT_SETTINGS } from '@/constants';

export type ResolvedLocale = 'en' | 'zh-CN';
export type LocalePreference = ResolvedLocale | 'system';

const DEFAULT_RESOLVED_LOCALE: ResolvedLocale =
  DEFAULT_SETTINGS.LOCALE === 'zh-CN' ? 'zh-CN' : 'en';

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'en' || value === 'zh-CN' || value === 'system';
}

export function detectSystemLocale(): ResolvedLocale {
  if (typeof navigator !== 'undefined') {
    const candidates: string[] = [];
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (typeof navigator.language === 'string') {
      candidates.push(navigator.language);
    }
    const normalized = candidates
      .map(locale => locale?.toLowerCase?.())
      .filter((locale): locale is string => Boolean(locale));

    if (normalized.some(locale => locale.startsWith('zh'))) {
      return 'zh-CN';
    }
    if (normalized.some(locale => locale.startsWith('en'))) {
      return 'en';
    }
  }
  return DEFAULT_RESOLVED_LOCALE;
}

export function resolveLocalePreference(preference: LocalePreference): ResolvedLocale {
  if (preference === 'system') {
    return detectSystemLocale();
  }
  return preference;
}
