/** Must match gridlock-backend/src/api-keys/wallet-auth.ts */
export function buildGridlockKeysMessage(
  action: string,
  wallet: string,
  timestampMs: number,
): string {
  return `gridlock:keys:${action}:${wallet}:${timestampMs}`;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const AUTH_CACHE_TTL_MS = 4 * 60 * 1000;
const authCache = new Map<string, { auth: WalletAuthHeaders; expiresAt: number }>();
const authInflight = new Map<string, Promise<WalletAuthHeaders>>();

export type WalletAuthHeaders = {
  wallet: string;
  timestampMs: number;
  signatureBase64: string;
};

export async function signGridlockKeysAction(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  wallet: string,
  action: string,
): Promise<WalletAuthHeaders> {
  const cacheKey = `${wallet}:${action}`;
  const cached = authCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.auth;
  }

  const pending = authInflight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const timestampMs = Date.now();
    const message = buildGridlockKeysMessage(action, wallet, timestampMs);
    const encoded = new TextEncoder().encode(message);
    const signature = await signMessage(encoded);
    const auth: WalletAuthHeaders = {
      wallet,
      timestampMs,
      signatureBase64: uint8ToBase64(signature),
    };
    authCache.set(cacheKey, { auth, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return auth;
  })().finally(() => {
    authInflight.delete(cacheKey);
  });

  authInflight.set(cacheKey, promise);
  return promise;
}

export function walletAuthHeaderRecord(
  auth: WalletAuthHeaders,
  insecure = false,
): Record<string, string> {
  if (insecure) {
    return { "X-Gridlock-Wallet": auth.wallet };
  }
  return {
    "X-Gridlock-Wallet": auth.wallet,
    "X-Gridlock-Timestamp": String(auth.timestampMs),
    "X-Gridlock-Signature": auth.signatureBase64,
  };
}

export const INSECURE_KEY_MANAGEMENT =
  process.env.NEXT_PUBLIC_INSECURE_KEY_MANAGEMENT === "true";
