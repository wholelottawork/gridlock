"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  DESKTOP_WORKER_DOWNLOADS,
  WORKER_APP_VERSION,
  detectDesktopPlatform,
  type DesktopWorkerPlatform,
} from "@/lib/worker-downloads";

const PLATFORMS: DesktopWorkerPlatform[] = ["windows", "mac", "linux"];

export function DesktopWorkerPanel() {
  const { publicKey } = useWallet();
  const [platform, setPlatform] = useState<DesktopWorkerPlatform>("windows");

  const walletHint = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  useEffect(() => {
    setPlatform(detectDesktopPlatform());
  }, []);

  return (
    <div className="card card-orange" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <span style={{
        position: "absolute", top: 16, right: 16,
        fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
        padding: "3px 8px", borderRadius: 4,
        background: "rgba(255,160,0,0.15)", color: "var(--orange)",
        border: "1px solid rgba(255,160,0,0.3)",
      }}>
        RECOMMENDED
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="var(--orange)">
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
        </svg>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Desktop Worker</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Gridlock Worker app · v{WORKER_APP_VERSION}</div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
        Install the desktop app for earnings, live jobs, and GPU settings. Includes the worker daemon — no terminal required.
      </p>

      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>
        DOWNLOAD
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {PLATFORMS.map((key) => {
          const dl = DESKTOP_WORKER_DOWNLOADS[key];
          const isSuggested = key === platform;
          return (
            <a
              key={key}
              href={dl.url}
              download={dl.filename}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 8, textDecoration: "none",
                border: `1px solid ${isSuggested ? "rgba(255,160,0,0.45)" : "var(--border)"}`,
                background: isSuggested ? "rgba(255,160,0,0.08)" : "var(--bg-0)",
                color: "inherit",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: isSuggested ? "var(--orange)" : "var(--text-primary)" }}>
                  {dl.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{dl.filename}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 6,
                background: isSuggested ? "#FFFFFF" : "var(--bg-3)",
                color: isSuggested ? "#000" : "var(--text-secondary)",
              }}>
                Download
              </span>
            </a>
          );
        })}
      </div>

      <ol style={{ margin: "0 0 4px", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <li>Install the app for your operating system</li>
        <li>Open <strong>Gridlock Worker</strong> and connect your wallet{walletHint ? ` (${walletHint})` : ""}</li>
        <li>Click <strong>Start</strong> — jobs arrive automatically</li>
      </ol>

      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>REQUIRES</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>NVIDIA GPU · CUDA</div>
          </div>
          <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>JOBS VIA</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>WebSocket</div>
          </div>
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
          Server or headless setup? Use <strong>Native Worker</strong> instead.
        </p>
      </div>
    </div>
  );
}
