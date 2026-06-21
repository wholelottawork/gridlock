"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/worker",      label: "Worker" },
  { href: "/console",     label: "Console" },
  { href: "/explorer",    label: "Explorer" },
  { href: "/stake",       label: "Stake" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const WALLET_ICONS: Record<string, string> = {
  Phantom:  "👻",
  Solflare: "🔆",
  Backpack: "🎒",
};

export function Navbar() {
  const path = usePathname();
  const { wallet, connected, connecting, publicKey, select, connect, disconnect, wallets } = useWallet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldConnect = useRef(false);

  // Hydration fix: wallet state is browser-only, render neutral until mounted
  useEffect(() => { setMounted(true); }, []);

  // After select() updates the wallet, call connect() to open the wallet popup
  useEffect(() => {
    if (shouldConnect.current && wallet && !connected && !connecting) {
      shouldConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connecting, connect]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelectWallet(name: string) {
    shouldConnect.current = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(name as any);
    setOpen(false);
  }

  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  const availableWallets = mounted
    ? wallets.filter((w) => w.readyState === "Installed" || w.readyState === "Loadable")
    : [];

  const isConnected  = mounted && connected;
  const isConnecting = mounted && connecting;

  return (
    <nav style={{
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 24px",
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 40,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, background: "var(--orange)", borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 14, color: "#000", letterSpacing: "-0.5px",
          }}>G</div>
          <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)", letterSpacing: "1.5px" }}>
            GRIDLOCK
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 13,
                fontWeight: active ? 700 : 500, textDecoration: "none",
                color: active ? "var(--orange)" : "var(--text-muted)",
                background: active ? "var(--orange-dim)" : "transparent",
                transition: "all 0.15s", letterSpacing: "0.2px",
              }}>
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Network status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span className="pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>DEVNET</span>
        </div>

        {/* Wallet button — always renders CONNECT on server (no wallet state), wallet UI after mount */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              background: isConnected ? "var(--orange-dim)" : "transparent",
              border: `1px solid ${isConnected ? "var(--orange)" : "var(--orange-border)"}`,
              borderRadius: 6, padding: "6px 16px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", color: "var(--orange)", letterSpacing: "0.5px",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {isConnected ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block", flexShrink: 0 }} />
                {shortAddr}
                <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
              </>
            ) : isConnecting ? "Connecting…" : "+ CONNECT"}
          </button>

          {open && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)",
              background: "var(--bg-2)", border: "1px solid var(--border)",
              borderRadius: 8, minWidth: 210, padding: 6, zIndex: 100,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {isConnected ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>
                    CONNECTED
                  </div>
                  <div style={{ padding: "4px 12px 10px", fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                    {publicKey?.toBase58().slice(0, 22)}…
                  </div>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  <button
                    onClick={() => { disconnect(); setOpen(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 5,
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, color: "var(--red)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,60,60,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>
                    SELECT WALLET
                  </div>
                  {availableWallets.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      No wallets detected.{" "}
                      <a href="https://phantom.app" target="_blank" rel="noopener noreferrer"
                        style={{ color: "var(--orange)", textDecoration: "none" }}>
                        Install Phantom →
                      </a>
                    </div>
                  ) : (
                    availableWallets.map((w) => (
                      <button
                        key={w.adapter.name}
                        onClick={() => handleSelectWallet(w.adapter.name)}
                        style={{
                          width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 5,
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                          display: "flex", alignItems: "center", gap: 9,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-3)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ fontSize: 16 }}>{WALLET_ICONS[w.adapter.name] ?? "◆"}</span>
                        {w.adapter.name}
                        {w.readyState === "Installed" && (
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--green)", fontWeight: 700 }}>
                            INSTALLED
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
