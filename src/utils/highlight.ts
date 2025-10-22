/**
 * Escape HTML entities to avoid XSS when rendering highlighted strings.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeKeywords(keywords?: string | string[]): string[] {
  if (!keywords) {
    return [];
  }

  if (typeof keywords === 'string') {
    return keywords
      .split(',')
      .map(keyword => keyword.trim())
      .filter(Boolean);
  }

  return keywords.map(keyword => keyword.trim()).filter(Boolean);
}

/**
 * Highlight matched keywords in text using <mark> tags.
 */
export function highlightText(text: string, keywords?: string | string[]): string {
  const normalizedKeywords = Array.from(new Set(normalizeKeywords(keywords)));

  if (!normalizedKeywords.length) {
    return escapeHtml(text);
  }

  const pattern = normalizedKeywords.map(escapeRegExp).join('|');
  const regex = new RegExp(pattern, 'gi');

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += `<mark>${escapeHtml(match[0])}</mark>`;
    lastIndex = (match.index ?? 0) + (match[0]?.length ?? 0);
    match = regex.exec(text);
  }

  result += escapeHtml(text.slice(lastIndex));

  return result;
}

/**
 * Highlight text and return as HTML string that can be safely injected.
 */
export function renderHighlighted(text: string, keywords?: string | string[]): { __html: string } {
  return {
    __html: highlightText(text, keywords),
  };
}

export function buildFeedKeywordMap<T extends { id: string; keywords?: string[] | null | undefined }>(
  feeds: readonly T[],
  extraKeys?: string | string[],
): Record<string, string[]> {
  const globalKeys = normalizeKeywords(extraKeys);
  const map: Record<string, string[]> = {};

  feeds.forEach(feed => {
    const feedKeywords = normalizeKeywords(feed.keywords ?? []);
    const combined = new Set<string>([...feedKeywords, ...globalKeys]);
    map[feed.id] = Array.from(combined);
  });

  return map;
}
