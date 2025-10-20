/**
 * Ensure MV3 service workers expose browser-like globals for Node polyfills.
 * Some dependencies fallback to `window` when `new Function` is blocked, so alias it.
 */
if (typeof globalThis !== 'undefined') {
  const globalObject = globalThis as Record<string, unknown>;

  if (typeof globalObject.window === 'undefined') {
    globalObject.window = globalObject;
  }

  if (typeof globalObject.self === 'undefined') {
    globalObject.self = globalObject;
  }

  if (typeof globalObject.global === 'undefined') {
    globalObject.global = globalObject;
  }
}
