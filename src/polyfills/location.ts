/**
 * Provide a minimal location polyfill for Node-based tooling (e.g., wxt prepare).
 * Axios expects globalThis.location.href to exist in certain build scenarios.
 */
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).location === 'undefined') {
  (globalThis as any).location = {
    href: 'http://localhost/',
  };
}
