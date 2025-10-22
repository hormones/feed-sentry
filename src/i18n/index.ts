import { DEFAULT_SETTINGS } from '@/constants';
import {
  resolveLocalePreference,
  type LocalePreference,
  type ResolvedLocale,
} from '@/utils/locale';

export type MessageParams = Record<string, string | number>;

interface MessageTree {
  [key: string]: string | MessageTree;
}

const FALLBACK_LOCALE: ResolvedLocale = 'en';
const LOCALE_FILES: Record<ResolvedLocale, string> = {
  en: '../locales/en.json',
  'zh-CN': '../locales/zh-CN.json',
};

const localeLoaders = import.meta.glob<MessageTree>('../locales/*.json', { import: 'default' });
const messageCache = new Map<ResolvedLocale, MessageTree>();
const localeListeners = new Set<(locale: ResolvedLocale) => void>();

let currentLocale: ResolvedLocale = resolveLocalePreference(DEFAULT_SETTINGS.LOCALE);

function getLoaderPath(locale: ResolvedLocale): string {
  const filePath = LOCALE_FILES[locale];
  if (!filePath) {
    throw new Error(`[i18n] Unsupported locale: ${locale}`);
  }
  return filePath;
}

async function importLocaleMessages(locale: ResolvedLocale): Promise<MessageTree> {
  if (messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  const loaderPath = getLoaderPath(locale);
  const importFn = localeLoaders[loaderPath];
  if (!importFn) {
    throw new Error(`[i18n] Missing localization file for ${locale}`);
  }

  const module = await importFn();
  const messages = module as MessageTree;
  messageCache.set(locale, messages);
  return messages;
}

function resolveNestedMessage(tree: MessageTree | undefined, segments: string[]): string | undefined {
  if (!tree) {
    return undefined;
  }

  let current: unknown = tree;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

function applyParams(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

async function ensureLocaleLoaded(locale: ResolvedLocale): Promise<void> {
  if (!messageCache.has(locale)) {
    await importLocaleMessages(locale);
  }
}

function getMessageFromCache(locale: ResolvedLocale, keySegments: string[]): string | undefined {
  const messages = messageCache.get(locale);
  if (!messages) {
    return undefined;
  }
  return resolveNestedMessage(messages, keySegments);
}

function notifyLocaleChange(locale: ResolvedLocale): void {
  localeListeners.forEach(listener => {
    try {
      listener(locale);
    } catch (error) {
      console.error('[i18n] Locale listener error', error);
    }
  });
}

export function getCurrentLocale(): ResolvedLocale {
  return currentLocale;
}

export function subscribeLocaleChange(listener: (locale: ResolvedLocale) => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

export async function initI18n(locale: LocalePreference = DEFAULT_SETTINGS.LOCALE): Promise<void> {
  const resolved = resolveLocalePreference(locale);
  await Promise.all([ensureLocaleLoaded(FALLBACK_LOCALE), ensureLocaleLoaded(resolved)]);
  currentLocale = resolved;
}

export async function setLocale(locale: LocalePreference): Promise<void> {
  const resolved = resolveLocalePreference(locale);
  if (currentLocale === resolved) {
    return;
  }

  await ensureLocaleLoaded(resolved);
  currentLocale = resolved;
  notifyLocaleChange(resolved);
}

export function t(key: string, params?: MessageParams, explicitLocale?: ResolvedLocale): string {
  const keySegments = key.split('.');
  const localesToTry: ResolvedLocale[] = [];

  if (explicitLocale) {
    localesToTry.push(explicitLocale);
  } else {
    localesToTry.push(currentLocale);
  }

  if (!localesToTry.includes(FALLBACK_LOCALE)) {
    localesToTry.push(FALLBACK_LOCALE);
  }

  for (const locale of localesToTry) {
    const template = getMessageFromCache(locale, keySegments);
    if (template) {
      return applyParams(template, params);
    }
  }

  console.warn('[i18n] Missing translation for key:', key);
  return key;
}
