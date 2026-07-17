// localStorage helpers for the investsense.<feature>.v1 key convention.
//
// The app shipped under the old StockSense name using a `stocksense.*` namespace.
// Renaming the keys outright would silently wipe an existing user's watchlist,
// holdings and saved chats, so reads fall back to the legacy key once and
// promote the value into the new namespace.

const LEGACY_PREFIX = "stocksense.";
const PREFIX = "investsense.";

/** Namespaced key for a feature, e.g. storageKey("holdings") → investsense.holdings.v1 */
export function storageKey(feature: string, version = 1): string {
  return `${PREFIX}${feature}.v${version}`;
}

/**
 * Reads a namespaced key, migrating the pre-rebrand `stocksense.*` value across
 * on first access. Returns null when absent or when storage is unavailable
 * (SSR, or Safari private mode, which throws on access).
 */
export function localGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const current = window.localStorage.getItem(key);
    if (current !== null) return current;

    if (!key.startsWith(PREFIX)) return null;
    const legacyKey = LEGACY_PREFIX + key.slice(PREFIX.length);
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy === null) return null;

    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

/** Writes a namespaced key, tolerating unavailable/full storage. */
export function localSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or storage blocked — the feature degrades to session-only.
  }
}

/** Removes a namespaced key and any legacy counterpart. */
export function localRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    if (key.startsWith(PREFIX)) {
      window.localStorage.removeItem(LEGACY_PREFIX + key.slice(PREFIX.length));
    }
  } catch {
    // ignore
  }
}
