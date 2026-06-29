"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  clearWalletSession,
  ensureWalletSession,
  getWalletSessionToken,
} from "@/lib/wallet-session";
import { INSECURE_KEY_MANAGEMENT } from "@/lib/wallet-auth";

type WalletSessionContextValue = {
  sessionToken: string | null;
  sessionReady: boolean;
  sessionError: string | null;
  ensureSession: () => Promise<string>;
};

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !wallet) {
      clearWalletSession();
      setSessionToken(null);
      setSessionReady(false);
      setSessionError(null);
      return;
    }

    if (INSECURE_KEY_MANAGEMENT) {
      setSessionToken("");
      setSessionReady(true);
      setSessionError(null);
      return;
    }

    const stored = getWalletSessionToken(wallet);
    if (stored) {
      setSessionToken(stored);
      setSessionReady(true);
      setSessionError(null);
      return;
    }

    setSessionToken(null);
    setSessionReady(false);
    setSessionError(null);
  }, [connected, wallet]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (!wallet) throw new Error("Connect your wallet first");
    if (INSECURE_KEY_MANAGEMENT) {
      setSessionToken("");
      setSessionReady(true);
      return "";
    }
    if (!signMessage) throw new Error("Your wallet does not support message signing");

    try {
      const token = await ensureWalletSession(wallet, signMessage);
      setSessionToken(token);
      setSessionReady(true);
      setSessionError(null);
      return token;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Wallet sign-in failed";
      setSessionError(message);
      setSessionReady(false);
      throw e;
    }
  }, [wallet, signMessage]);

  const value = useMemo(
    () => ({ sessionToken, sessionReady, sessionError, ensureSession }),
    [sessionToken, sessionReady, sessionError, ensureSession],
  );

  return (
    <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>
  );
}

export function useWalletSession(): WalletSessionContextValue {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) {
    throw new Error("useWalletSession must be used within WalletSessionProvider");
  }
  return ctx;
}
