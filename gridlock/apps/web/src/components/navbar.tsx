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
  { href: "/governance",  label: "Governance" },
  { href: "/docs",        label: "Docs" },
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
    ? wallets.filter((w) => w.readyState === "Installed" || w.readyState === "Loadable")
    : [];

  const isConnected  = mounted && connected;
  const isConnecting = mounted && connecting;

  return (
    <nav style={{
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      position: "sticky",
      top: 0,
      zIndex: 50,
      boxShadow: "0 1px 0 rgba(255,107,26,0.08), 0 4px 24px rgba(0,0,0,0.4)",
    }}>
      {/* Subtle orange accent line at top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(255,107,26,0.5) 40%, rgba(255,107,26,0.5) 60%, transparent 100%)",
      }} />

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
            width: 30, height: 30,
            background: "linear-gradient(135deg, var(--orange) 0%, var(--orange-2) 100%)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 15, color: "#000",
            boxShadow: "0 0 16px rgba(255,107,26,0.5), 0 1px 0 rgba(255,255,255,0.2) inset",
            flexShrink: 0,
          }}>G</div>
          <span style={{
            fontWeight: 800, fontSize: 14, color: "var(--text-primary)",
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
                color: active ? "var(--orange)" : "var(--text-secondary)",
                background: active ? "rgba(255,107,26,0.07)" : "transparent",
                transition: "all 0.15s",
                letterSpacing: "0.2px",
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}>
                {l.label}
                {active && (
                  <span style={{
                    position: "absolute", bottom: -1, left: "20%", right: "20%",
                    height: 2, borderRadius: 1,
                    background: "var(--orange)",
                    boxShadow: "0 0 8px var(--orange)",
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
            background: "var(--green)", display: "inline-block",
          }} />
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>DEVNET</span>
        </div>

        {/* Wallet button */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              background: isConnected ? "rgba(255,107,26,0.1)" : "transparent",
              border: `1px solid ${isConnected ? "var(--orange)" : "rgba(255,107,26,0.35)"}`,
              borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", color: "var(--orange)", letterSpacing: "0.5px",
              transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: isConnected ? "0 0 16px rgba(255,107,26,0.2)" : "none",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(255,107,26,0.3)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--orange)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = isConnected ? "0 0 16px rgba(255,107,26,0.2)" : "none";
              (e.currentTarget as HTMLElement).style.borderColor = isConnected ? "var(--orange)" : "rgba(255,107,26,0.35)";
            }}
          >
            {isConnected ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block", flexShrink: 0, boxShadow: "0 0 6px var(--green)" }} />
                {shortAddr}
                <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
              </>
            ) : isConnecting ? "Connecting…" : "+ CONNECT"}
          </button>

          {open && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 10px)",
              background: "rgba(8,8,8,0.96)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, minWidth: 220, padding: 6, zIndex: 100,
              boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,107,26,0.08)",
            }}>
              {isConnected ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>CONNECTED</div>
                  <div style={{ padding: "4px 12px 10px", fontFamily: "monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all" }}>
                    {publicKey?.toBase58().slice(0, 22)}…
                  </div>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  <button
                    onClick={() => { disconnect(); setOpen(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 6,
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, color: "var(--red)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,69,69,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>SELECT WALLET</div>
                  {availableWallets.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      No wallets detected.{" "}
                      <a href="https://phantom.app" target="_blank" rel="noopener noreferrer"
                        style={{ color: "var(--orange)", textDecoration: "none", fontWeight: 700 }}>
                        Install Phantom →
                      </a>
                    </div>
                  ) : (
                    availableWallets.map((w) => (
                      <button
                        key={w.adapter.name}
                        onClick={() => handleSelectWallet(w.adapter.name)}
                        style={{
                          width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 6,
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ fontSize: 16 }}>{WALLET_ICONS[w.adapter.name] ?? "◆"}</span>
                        {w.adapter.name}
                        {w.readyState === "Installed" && (
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--green)", fontWeight: 700, letterSpacing: "0.5px" }}>
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
