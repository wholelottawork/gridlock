"use client";
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

const HELIUS_DEVNET = "https://devnet.helius-rpc.com/?api-key=19d06ab4-7e29-4c81-8fef-2af6f4d51bbe";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <QueryClientProvider client={client}>
      <ConnectionProvider endpoint={HELIUS_DEVNET}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          {children}
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
