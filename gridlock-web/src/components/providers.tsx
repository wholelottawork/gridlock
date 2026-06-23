"use client";
import { useMemo, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { createSolanaClient } from "@metamask/connect-solana";
import { BrowserWorkerProvider } from "@/context/browser-worker-context";

const HELIUS_DEVNET = "https://devnet.helius-rpc.com/?api-key=19d06ab4-7e29-4c81-8fef-2af6f4d51bbe";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const wallets = useMemo(() => [
    new SolflareWalletAdapter(),
  ], []);

  useEffect(() => {
    createSolanaClient({
      dapp: { name: "Gridlock", url: window.location.origin },
    });
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ConnectionProvider endpoint={HELIUS_DEVNET}>
        <WalletProvider wallets={wallets} autoConnect>
          <BrowserWorkerProvider>
            {children}
          </BrowserWorkerProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
