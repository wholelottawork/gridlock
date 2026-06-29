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

export async function signGridlockKeysAction(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  wallet: string,
  action: string,
): Promise<{ wallet: string; timestampMs: number; signatureBase64: string }> {
  const timestampMs = Date.now();
  const message = buildGridlockKeysMessage(action, wallet, timestampMs);
  const encoded = new TextEncoder().encode(message);
  const signature = await signMessage(encoded);
  return { wallet, timestampMs, signatureBase64: uint8ToBase64(signature) };
}

export type WalletAuthHeaders = {
  wallet: string;
  timestampMs: number;
  signatureBase64: string;
};

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
