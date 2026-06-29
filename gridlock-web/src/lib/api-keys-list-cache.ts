import type { ApiKeyPublic } from "./api-client";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { keys: ApiKeyPublic[]; expiresAt: number }>();

export function getCachedApiKeys(wallet: string): ApiKeyPublic[] | null {
  const entry = cache.get(wallet);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.keys;
}

export function setCachedApiKeys(wallet: string, keys: ApiKeyPublic[]): void {
  cache.set(wallet, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateApiKeysCache(wallet?: string): void {
  if (wallet) cache.delete(wallet);
  else cache.clear();
}
