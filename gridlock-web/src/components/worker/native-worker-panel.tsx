"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  NATIVE_WORKER_PACKAGE,
  OLLAMA_PULL_COMMAND,
  WORKER_APP_VERSION,
  nativeWorkerCommand,
  nativeWorkerSetupCommand,
} from "@/lib/worker-downloads";

export function NativeWorkerPanel() {
  const { publicKey, connected } = useWallet();
  const [copied, setCopied] = useState<string | null>(null);

  const wallet = publicKey?.toBase58() ?? "YOUR_WALLET_ADDRESS";
  const runCommand = nativeWorkerCommand(wallet);

  useEffect(() => {
    setCopied(null);
  }, [wallet]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Native Worker</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          CLI · Ollama / vLLM · v{WORKER_APP_VERSION}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
        Headless worker for servers and power users. Runs in your terminal, connects to the router over WebSocket, and forwards jobs to Ollama or vLLM on your GPU.
      </p>

      <ol style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <li>Install <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: "var(--orange)" }}>Ollama</a> (recommended on Windows) — the worker can auto-start it</li>
        <li>In the worker folder: run setup once, then start the worker{connected && publicKey ? " (wallet pre-filled)" : ""}</li>
        <li>Connects to <code style={{ fontSize: 11 }}>api.reacton.dev</code> automatically</li>
      </ol>

      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 8 }}>
        SETUP (ONCE)
      </div>
      <CommandRow
        label={nativeWorkerSetupCommand()}
        copied={copied === "setup"}
        onCopy={() => copy(nativeWorkerSetupCommand(), "setup")}
        muted
      />

      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", margin: "14px 0 8px" }}>
        INFERENCE (OPTIONAL — AUTO-PULLED)
      </div>
      <CommandRow
        label={OLLAMA_PULL_COMMAND}
        copied={copied === "ollama"}
        onCopy={() => copy(OLLAMA_PULL_COMMAND, "ollama")}
        muted
      />

      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", margin: "14px 0 8px" }}>
        START WORKER
      </div>
      <CommandRow
        label={runCommand}
        copied={copied === "run"}
        onCopy={() => copy(runCommand, "run")}
        accent
      />

      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>REQUIRES</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Node 18+ · NVIDIA</div>
          </div>
          <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>PACKAGE</div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{NATIVE_WORKER_PACKAGE}</div>
          </div>
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
          Want a UI? Use <strong>Desktop Worker</strong> instead — same network, Electron dashboard included.
        </p>
      </div>
    </div>
  );
}

function CommandRow({
  label,
  copied,
  onCopy,
  accent,
  muted,
}: {
  label: string;
  copied: boolean;
  onCopy: () => void;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "var(--bg-0)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 12px", overflowX: "auto",
    }}>
      <code style={{
        flex: 1, fontSize: 11, whiteSpace: "nowrap",
        color: accent ? "var(--orange)" : muted ? "var(--text-secondary)" : "var(--text-primary)",
      }}>
        {label}
      </code>
      <button
        type="button"
        onClick={onCopy}
        style={{
          flexShrink: 0, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-secondary)", cursor: "pointer",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
