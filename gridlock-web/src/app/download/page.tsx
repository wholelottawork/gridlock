"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GridlockLogo } from "@/components/gridlock-logo";

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };

const WINDOWS_RELEASE = {
  label: "Windows",
  version: "v0.1.0",
  file: "Gridlock-Worker-Setup-0.1.0.exe",
  size: "94 MB",
  url: "https://github.com/wholelottawork/gridlock/releases/download/v0.1.0/Gridlock-Worker-Setup-0.1.0.exe",
  arch: "x64",
  note: "Windows 10 / 11",
};

function WindowsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
      </svg>
    ),
    title: "Native desktop app",
    desc: "Runs as a background process — low overhead, starts with your OS. Your GPU is always ready to earn.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Real-time earnings dashboard",
    desc: "See jobs as they arrive, TTFT latency live, SLA pass rate, and $LOCK earned — updated every second.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Wallet & stake management",
    desc: "Connect your Solana wallet, register as a worker, and manage your $LOCK stake without leaving the app.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
    ),
    title: "One-click vLLM pairing",
    desc: "Point the worker at your local vLLM instance and you're done. Auto-detects GPU, tier, and model capacity.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Automatic heartbeat & failover",
    desc: "Heartbeats run in the background. If your connection drops, the worker gracefully drains in-flight jobs — no penalties.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    title: "Lightweight system tray",
    desc: "Minimize to tray and forget about it. You'll see a notification when you earn or miss an SLA — otherwise it's silent.",
  },
];

const REQUIREMENTS = [
  { label: "GPU",     value: "NVIDIA RTX 3080 or better (RTX 4090 / A100 / H100 recommended)" },
  { label: "VRAM",   value: "10 GB minimum · 24 GB+ for Standard and Realtime tiers" },
  { label: "RAM",    value: "16 GB system RAM" },
  { label: "CPU",    value: "4+ cores (8+ recommended)" },
  { label: "Drivers",value: "NVIDIA driver 520+ · CUDA 12.1+" },
  { label: "Network",value: "100 Mbps upload, static IP preferred" },
  { label: "vLLM",   value: "v0.4.0+ running locally on port 8000" },
  { label: "Wallet", value: "Solana wallet with 1,000+ $LOCK for minimum stake" },
];

export default function DownloadPage() {
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px 56px", textAlign: "center" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{
              width: 72, height: 72,
              background: "#FFFFFF",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 24px 64px rgba(0,0,0,0.8)",
            }}>
              <GridlockLogo size={42} color="#000" />
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "2px", marginBottom: 14 }}>
            GRIDLOCK WORKER — DESKTOP APP
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20 }}>
            Your GPU. Your earnings.
          </h1>
          <p style={{ fontSize: 16, color: "var(--text-secondary)", fontWeight: 700, maxWidth: 540, margin: "0 auto 48px", lineHeight: 1.8 }}>
            Install the Gridlock Worker app, connect your GPU, and start earning $LOCK for every AI request you process on time.
          </p>
        </motion.div>

        {/* ── Download card ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, duration: 0.5 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              background: hovered ? "var(--bg-3)" : "var(--bg-2)",
              border: `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "var(--border)"}`,
              borderRadius: 12,
              padding: "28px 32px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
              transition: "all 0.2s",
              cursor: "default",
              minWidth: 280,
            }}
          >
            <div style={{ color: "var(--text-primary)", marginBottom: 16 }}>
              <WindowsIcon />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{WINDOWS_RELEASE.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 2 }}>{WINDOWS_RELEASE.note}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>{WINDOWS_RELEASE.arch} · {WINDOWS_RELEASE.size}</div>
            <a
              href={WINDOWS_RELEASE.url}
              download
              style={{
                display: "block", width: "100%",
                background: "#FFFFFF", color: "#000000",
                border: "none", borderRadius: 8,
                padding: "11px 0",
                fontSize: 13, fontWeight: 800,
                textDecoration: "none", textAlign: "center",
                letterSpacing: "0.3px", transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Download {WINDOWS_RELEASE.version}
            </a>
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
              {WINDOWS_RELEASE.file}
            </div>
          </motion.div>
        </div>

        <div style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>
          All releases are signed. View{" "}
          <a
            href="https://github.com/wholelottawork/gridlock/releases"
            target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 800 }}
          >
            all releases on GitHub →
          </a>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "2px", marginBottom: 14 }}>WHAT'S INCLUDED</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Everything you need to earn</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.45 }}
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px" }}
              >
                <div style={{ color: "var(--text-primary)", marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 600 }}>{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick start ────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "2px", marginBottom: 14 }}>QUICK START</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 20 }}>Up and earning in 15 minutes</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                { n: "01", title: "Download and install",  desc: "Run the installer for your OS. The app will launch automatically. It sits in your system tray when minimised." },
                { n: "02", title: "Connect your wallet",   desc: "Open the app and connect your Solana wallet (Phantom, Solflare, or Backpack). You'll need $LOCK tokens for stake." },
                { n: "03", title: "Point to your vLLM",    desc: "Enter the address of your running vLLM instance (default: http://localhost:8000). The app will detect your GPU automatically." },
                { n: "04", title: "Stake and go live",     desc: "Choose your tier, set your stake amount, and click Register. Jobs start arriving immediately — you're earning." },
              ].map((s, i) => (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  style={{ display: "flex", gap: 16 }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "var(--bg-3)", border: "1px solid var(--border-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, color: "var(--text-secondary)", letterSpacing: "0.5px",
                  }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 600 }}>{s.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "2px", marginBottom: 20 }}>SYSTEM REQUIREMENTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {REQUIREMENTS.map((r, i) => (
                <div key={r.label} style={{
                  display: "flex", gap: 16, padding: "13px 16px",
                  background: i % 2 === 0 ? "var(--bg-2)" : "var(--bg-3)",
                  alignItems: "flex-start",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", width: 64, flexShrink: 0, letterSpacing: "0.3px", paddingTop: 1 }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, lineHeight: 1.6 }}>
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, fontWeight: 600 }}>
              vLLM must be running separately. The Gridlock Worker app connects to it and handles all the network + payment logic.{" "}
              <a href="/docs" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 700 }}>
                See the full setup guide →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)", textAlign: "center", padding: "72px 24px" }}
      >
        <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-1px", marginBottom: 14 }}>
          Ready to plug in your GPU?
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, fontWeight: 700, marginBottom: 36, maxWidth: 500, margin: "0 auto 36px" }}>
          Download takes 2 minutes. You can be earning $LOCK before your next coffee.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href={WINDOWS_RELEASE.url}
            download
            style={{
              display: "inline-block",
              background: "#FFFFFF", color: "#000",
              border: "none", borderRadius: 8,
              padding: "13px 32px", fontSize: 14, fontWeight: 800,
              textDecoration: "none", letterSpacing: "0.2px", transition: "opacity 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Download for Windows
          </a>
          <Link href="/docs" style={{
            display: "inline-block",
            background: "transparent", color: "var(--text-secondary)",
            border: "1px solid var(--border-2)", borderRadius: 8,
            padding: "13px 32px", fontSize: 14, fontWeight: 800,
            textDecoration: "none", letterSpacing: "0.2px", transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            Read Setup Guide
          </Link>
          <Link href="/worker" style={{
            display: "inline-block",
            background: "transparent", color: "var(--text-secondary)",
            border: "1px solid var(--border-2)", borderRadius: 8,
            padding: "13px 32px", fontSize: 14, fontWeight: 800,
            textDecoration: "none", letterSpacing: "0.2px", transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            Worker Dashboard
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
