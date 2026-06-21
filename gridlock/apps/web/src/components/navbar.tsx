"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/worker",      label: "Worker" },
  { href: "/console",     label: "Console" },
  { href: "/explorer",    label: "Explorer" },
  { href: "/stake",       label: "Stake" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const path = usePathname();

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
            width: 28,
            height: 28,
            background: "var(--orange)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 14,
            color: "#000",
            letterSpacing: "-0.5px",
          }}>
            G
          </div>
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
                padding: "5px 12px",
                borderRadius: 5,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                textDecoration: "none",
                color: active ? "var(--orange)" : "var(--text-muted)",
                background: active ? "var(--orange-dim)" : "transparent",
                transition: "all 0.15s",
                letterSpacing: "0.2px",
              }}>
                {l.label}
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
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>DEVNET</span>
        </div>

        {/* Connect wallet */}
        <button style={{
          background: "transparent",
          border: "1px solid var(--orange-border)",
          borderRadius: 6,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          color: "var(--orange)",
          letterSpacing: "0.5px",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--orange-dim)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}>
          CONNECT
        </button>
      </div>
    </nav>
  );
}
