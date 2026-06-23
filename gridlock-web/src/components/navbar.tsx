"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { WalletIcon } from "@/components/wallet-icon";

const links = [
  { href: "/worker",      label: "Worker" },
  { href: "/console",     label: "Console" },
  { href: "/explorer",    label: "Explorer" },
  { href: "/stake",       label: "Stake" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/governance",  label: "Governance" },
  { href: "/docs",        label: "Docs" },
];

const WALLET_ORDER = ["Phantom", "MetaMask", "Solflare"];

const INSTALL_LINKS: Record<string, string> = {
  Phantom: "https://phantom.app",
  MetaMask: "https://metamask.io",
  Solflare: "https://solflare.com",
};

export function Navbar() {
  const path = usePathname();
  const { wallet, connected, connecting, publicKey, select, connect, disconnect, wallets } = useWallet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldConnect = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (shouldConnect.current && wallet && !connected && !connecting) {
      shouldConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connecting, connect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
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
    ? wallets
        .filter((w) => w.readyState === "Installed" || w.readyState === "Loadable")
        .sort((a, b) => {
          const ai = WALLET_ORDER.indexOf(a.adapter.name);
          const bi = WALLET_ORDER.indexOf(b.adapter.name);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
    : [];

  const isConnected  = mounted && connected;
  const isConnecting = mounted && connecting;

  return (
    <nav style={{
      background: "rgba(0,0,0,0.88)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 24px",
        height: 54,
        display: "flex",
        alignItems: "center",
        gap: 36,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28,
            background: "#FFFFFF",
            borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 14, color: "#000",
            flexShrink: 0,
          }}>G</div>
          <span style={{
            fontWeight: 800, fontSize: 13, color: "#FFFFFF",
            letterSpacing: "2px", textTransform: "uppercase",
          }}>
            GRIDLOCK
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1 }}>
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                position: "relative",
                padding: "6px 13px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                textDecoration: "none",
                color: active ? "#FFFFFF" : "#666666",
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                transition: "all 0.15s",
                letterSpacing: "0.2px",
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "#AAAAAA";
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "#666666";
              }}>
                {l.label}
                {active && (
                  <span style={{
                    position: "absolute", bottom: -1, left: "20%", right: "20%",
                    height: 2, borderRadius: 1,
                    background: "#FFFFFF",
                  }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Network status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span className="pulse" style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#555555", display: "inline-block",
          }} />
          <span style={{ fontSize: 11, color: "#404040", fontWeight: 700, letterSpacing: "1px" }}>DEVNET</span>
        </div>

        {/* Wallet button */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              background: isConnected ? "rgba(255,255,255,0.08)" : "transparent",
              border: `1px solid ${isConnected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)"}`,
              borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", color: "#FFFFFF", letterSpacing: "0.5px",
              transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 7,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.4)";
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = isConnected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)";
              (e.currentTarget as HTMLElement).style.background = isConnected ? "rgba(255,255,255,0.08)" : "transparent";
            }}
          >
            {isConnected ? (
              <>
                <WalletIcon name={wallet?.adapter.name ?? ""} icon={wallet?.adapter.icon} size={18} />
                {shortAddr}
                <span style={{ opacity: 0.4, fontSize: 9 }}>▾</span>
              </>
            ) : isConnecting ? "Connecting…" : "+ CONNECT"}
          </button>

          {open && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 10px)",
              background: "rgba(8,8,8,0.98)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, minWidth: 220, padding: 6, zIndex: 100,
              boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
            }}>
              {isConnected ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "#404040", fontWeight: 700, letterSpacing: "1px" }}>CONNECTED</div>
                  <div style={{ padding: "4px 12px 10px", fontFamily: "monospace", fontSize: 11, color: "#AAAAAA", wordBreak: "break-all" }}>
                    {publicKey?.toBase58().slice(0, 22)}…
                  </div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 6px" }} />
                  <button
                    onClick={() => { disconnect(); setOpen(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 6,
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, color: "#888888",
                    }}
                    onMouseEnter={e => { (e.currentTarget.style.background = "rgba(255,255,255,0.04)"); (e.currentTarget.style.color = "#FFFFFF"); }}
                    onMouseLeave={e => { (e.currentTarget.style.background = "transparent"); (e.currentTarget.style.color = "#888888"); }}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "#404040", fontWeight: 700, letterSpacing: "1px" }}>SELECT WALLET</div>
                  {availableWallets.length === 0 ? (
                    <div style={{ padding: "6px 6px 4px" }}>
                      <div style={{ padding: "8px 12px 6px", fontSize: 12, color: "#555555", lineHeight: 1.6 }}>
                        No wallets detected. Install one:
                      </div>
                      {WALLET_ORDER.map((name) => (
                        <a
                          key={name}
                          href={INSTALL_LINKS[name]}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 12px", borderRadius: 6,
                            textDecoration: "none", color: "#FFFFFF",
                            fontSize: 13, fontWeight: 600,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <WalletIcon name={name} size={20} />
                          {name}
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "#666666", fontWeight: 700 }}>
                            INSTALL →
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    availableWallets.map((w) => (
                      <button
                        key={w.adapter.name}
                        onClick={() => handleSelectWallet(w.adapter.name)}
                        style={{
                          width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 6,
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: 13, fontWeight: 600, color: "#FFFFFF",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <WalletIcon name={w.adapter.name} icon={w.adapter.icon} size={20} />
                        {w.adapter.name}
                        {w.readyState === "Installed" && (
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "#666666", fontWeight: 700, letterSpacing: "0.5px" }}>
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
