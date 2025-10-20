import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useThemeVars } from 'naive-ui';
import { normalizeKeywords } from '@/utils/highlight';
import type { EntryListItem } from '@/components/entry-list.types';

export interface UseEntryHighlightOptions {
  entries: MaybeRefOrGetter<EntryListItem[] | undefined>;
  highlightKeys?: MaybeRefOrGetter<string | string[] | undefined>;
  feedKeywordMap?: MaybeRefOrGetter<Record<string, string[]> | undefined>;
}

export function useEntryHighlight(options: UseEntryHighlightOptions) {
  const themeVars = useThemeVars();

  const highlightStyle = computed(() => ({
    padding: '0 6px',
    borderRadius: themeVars.value.borderRadius,
    display: 'inline-block',
    color: themeVars.value.baseColor,
    background: themeVars.value.primaryColor,
    transition: `all .3s ${themeVars.value.cubicBezierEaseInOut}`,
    fontWeight: 600,
  }));

  const entriesRef = computed<EntryListItem[]>(() => toValue(options.entries) ?? []);
  const highlightKeysRef = computed<string | string[] | undefined>(() => toValue(options.highlightKeys));
  const feedKeywordMapRef = computed<Record<string, string[]>>(
    () => toValue(options.feedKeywordMap) ?? {},
  );

  const globalKeywords = computed(() => normalizeKeywords(highlightKeysRef.value));

  const renderedItems = computed(() =>
    entriesRef.value.map(entry => {
      const feedKeywords = feedKeywordMapRef.value[entry.feedId] ?? [];
      const keywords = Array.from(new Set<string>([...feedKeywords, ...globalKeywords.value]));
      return {
        ...entry,
        patterns: keywords,
      };
    }),
  );

  return {
    highlightStyle,
    renderedItems,
  };
}

export default useEntryHighlight;
