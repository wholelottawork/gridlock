import { createWalletSession } from "./api-client";
import {
  INSECURE_KEY_MANAGEMENT,
  signGridlockKeysAction,
  walletAuthHeaderRecord,
  type WalletAuthHeaders,
} from "./wallet-auth";

const STORAGE_KEY = "gridlock:wallet-session:v1";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type StoredSession = {
  wallet: string;
  token: string;
  expiresAt: number;
};

const inflight = new Map<string, Promise<string>>();

function readStored(wallet: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.wallet !== wallet) return null;
    if (parsed.expiresAt <= Date.now() + REFRESH_BUFFER_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearWalletSession(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
  inflight.clear();
}

export function getWalletSessionToken(wallet: string): string | null {
  return readStored(wallet)?.token ?? null;
}

/** One sign per browser session → 24h read token for keys/billing. */
export async function ensureWalletSession(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  if (INSECURE_KEY_MANAGEMENT) {
    return "";
  }

  const cached = readStored(wallet);
  if (cached) return cached.token;

  const pending = inflight.get(wallet);
  if (pending) return pending;

  const promise = (async () => {
    const auth = await signGridlockKeysAction(signMessage, wallet, "session");
    const res = await createWalletSession(auth);
    if (res.wallet !== wallet) {
      throw new Error("Session wallet mismatch");
    }
    writeStored({ wallet, token: res.token, expiresAt: res.expires_at });
    return res.token;
  })().finally(() => {
    inflight.delete(wallet);
  });

  inflight.set(wallet, promise);
  return promise;
}

export function readAuthHeaders(
  wallet: string,
  sessionToken: string,
): Record<string, string> {
  if (INSECURE_KEY_MANAGEMENT) {
    const auth: WalletAuthHeaders = {
      wallet,
      timestampMs: Date.now(),
      signatureBase64: "",
    };
    return walletAuthHeaderRecord(auth, true);
  }
  return { Authorization: `Bearer ${sessionToken}` };
}

export function isSessionAuthError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { status?: number }).status === 401;
}
