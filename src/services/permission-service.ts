import browser from 'webextension-polyfill';

/**
 * Build an origin pattern string suitable for chrome.permissions APIs.
 */
export function buildOriginPermission(url: string): string {
  const parsed = new URL(url);
  const port = parsed.port ? `:${parsed.port}` : '';
  return `${parsed.protocol}//${parsed.hostname}${port}/*`;
}

/**
 * Check if the extension already holds host permission for a feed URL.
 */
export async function hasFeedHostPermission(url: string): Promise<boolean> {
  const origin = buildOriginPermission(url);
  try {
    return await browser.permissions.contains({ origins: [origin] });
  } catch (error) {
    console.error('[Permission Service] Permission check failed:', error);
    return false;
  }
}

/**
 * Request host permission for the provided feed URL.
 * Returns true when the user approves the permission prompt.
 */
export async function requestFeedHostPermission(url: string): Promise<boolean> {
  const origin = buildOriginPermission(url);
  try {
    const granted = await browser.permissions.request({ origins: [origin] });
    if (!granted) {
      console.warn('[Permission Service] User declined host permission:', origin);
    }
    return granted;
  } catch (error) {
    console.error('[Permission Service] Permission request failed:', error);
    return false;
  }
}
