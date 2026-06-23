"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type OS = "macos" | "windows" | "linux";

const NODE_INSTALL: Record<OS, string> = {
  macos: "brew install node",
  windows: "winget install OpenJS.NodeJS",
  linux: "sudo apt install -y nodejs npm",
};

export function DesktopWorkerPanel() {
  const { publicKey } = useWallet();
  const [os, setOs] = useState<OS>("macos");
  const [copied, setCopied] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const wallet = publicKey?.toBase58() ?? "YOUR_WALLET_ADDRESS";

  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || "").toLowerCase();
    if (p.includes("win")) setOs("windows");
    else if (p.includes("linux")) setOs("linux");
    else setOs("macos");
  }, []);

  const daemonCommand = `GRIDLOCK_BACKEND_URL=${apiUrl} GRIDLOCK_WALLET=${wallet} python python/daemon.py`;
  const electronCommand = `cd gridlock-worker && npm install && npm run dev`;

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card card-orange" style={{ position: "relative", height: "100%" }}>
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
        <svg width={22} height={22} viewBox="0 0 24 24" fill="var(--orange)">
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
        </svg>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Desktop Worker</div>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6, maxWidth: 520 }}>
        Run the Gridlock Electron app + Python daemon on your NVIDIA GPU. Handles registration, heartbeats, and inference — highest throughput and earnings.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, fontSize: 13, color: "var(--text-secondary)" }}>
        <div>1. Clone the repo and open <code style={{ color: "var(--orange)" }}>gridlock-worker</code></div>
        <div>2. Copy the command below (wallet + backend URL pre-filled when connected)</div>
        <div>3. Run in terminal — daemon registers and starts polling for jobs</div>
      </div>

      <div style={{ marginBottom: 10, fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>
        PYTHON DAEMON (headless)
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--bg-0)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "10px 12px", marginBottom: 14, overflowX: "auto",
      }}>
        <code style={{ flex: 1, fontSize: 11, color: "var(--orange)", whiteSpace: "nowrap" }}>{daemonCommand}</code>
        <button
          type="button"
          onClick={() => copy(daemonCommand)}
          style={{
            flexShrink: 0, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-secondary)", cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div style={{ marginBottom: 10, fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>
        ELECTRON APP (UI + daemon)
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--bg-0)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "10px 12px", marginBottom: 18, overflowX: "auto",
      }}>
        <code style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{electronCommand}</code>
        <button
          type="button"
          onClick={() => copy(electronCommand)}
          style={{
            flexShrink: 0, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-secondary)", cursor: "pointer",
          }}
        >
          Copy
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Need Node.js 18+?</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["macos", "windows", "linux"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOs(o)}
              style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${os === o ? "rgba(255,160,0,0.4)" : "var(--border)"}`,
                background: os === o ? "rgba(255,160,0,0.1)" : "transparent",
                color: os === o ? "var(--orange)" : "var(--text-muted)",
              }}
            >
              {o === "macos" ? "macOS" : o === "windows" ? "Windows" : "Linux"}
            </button>
          ))}
        </div>
        <div style={{
          background: "var(--bg-0)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)",
        }}>
          {NODE_INSTALL[os]}
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
          Requires NVIDIA GPU (CUDA). Connects via WebSocket (<code>/v1/ws</code>) for job dispatch.
          Install <code>pip install websocket-client</code> for native WS support.
        </p>
      </div>
    </div>
  );
}
