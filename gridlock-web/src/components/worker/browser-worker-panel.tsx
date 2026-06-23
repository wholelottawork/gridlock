"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWebGPU } from "@/hooks/use-webgpu";
import { useBrowserWorker, BROWSER_MODEL } from "@/context/browser-worker-context";
import { fmt } from "@/lib/utils";

function formatUptime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function BrowserWorkerPanel() {
  const { connected } = useWallet();
  const webgpu = useWebGPU();
  const worker = useBrowserWorker();

  const {
    status,
    error,
    loadProgress,
    loadText,
    uptime,
    jobsCompleted,
    currentJobId,
    benchmarkTokPerSec,
    earningsToday,
    startWorker,
    stopWorker,
  } = worker;

  const isReady = status === "ready" || status === "working";
  const statusLabel = isReady ? "Ready" : "Not Ready";
  const statusColor = isReady ? "var(--green)" : "var(--text-muted)";

  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 8 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Browser Worker</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                WebLLM · {BROWSER_MODEL.split("-").slice(0, 2).join(" ")} · runs in-tab via WebGPU
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: statusColor, flexShrink: 0 }}>
              <span className={isReady ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
              {statusLabel}
            </span>
          </div>

          {!connected && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: "1px solid rgba(255,160,0,0.25)", background: "rgba(255,160,0,0.04)", fontSize: 12, color: "var(--orange)", lineHeight: 1.5 }}>
              Connect wallet with <strong>CONNECT</strong> to start.
            </div>
          )}

          {webgpu.supported === false && !webgpu.loading && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: "1px solid rgba(255,68,68,0.3)", background: "rgba(255,68,68,0.06)", fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}>
              WebGPU required — use Chrome or Edge on desktop.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 14 }}>
            <StatBox label="GPU" value={webgpu.loading ? "Detecting…" : webgpu.gpuName ?? "—"} wide />
            <StatBox label="VRAM" value={webgpu.estimatedVramGb != null ? `~${webgpu.estimatedVramGb} GB` : "—"} />
            <StatBox label="EARNED" value={earningsToday.toFixed(2)} />
            <StatBox label="UPTIME" value={formatUptime(uptime)} />
            <StatBox label="JOBS" value={fmt(jobsCompleted, 0)} />
            <StatBox label="TOK/S" value={benchmarkTokPerSec > 0 ? benchmarkTokPerSec.toFixed(1) : "—"} />
          </div>

          {(isReady || status === "downloading" || status === "initializing" || status === "connecting") && (
            <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
              {(status === "downloading" || status === "initializing") ? (
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "var(--text-muted)" }}>
                    <span>{loadText}</span>
                    <span>{Math.round(loadProgress * 100)}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${loadProgress * 100}%`, background: "var(--orange)" }} />
                  </div>
                </div>
              ) : currentJobId ? (
                <div style={{
                  width: "100%", padding: "8px 10px", borderRadius: 8,
                  background: "rgba(255,160,0,0.08)", border: "1px solid rgba(255,160,0,0.2)", fontSize: 12,
                }}>
                  Processing job{" "}
                  <span style={{ fontFamily: "monospace", color: "var(--orange)" }}>{currentJobId.slice(0, 12)}…</span>
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.25)", fontSize: 12, color: "var(--red)" }}>
              {error}
            </div>
          )}
        </div>

        <div>
          {isReady ? (
            <button type="button" onClick={() => void stopWorker()} style={{
              width: "100%", height: 52, borderRadius: 8, border: "1px solid rgba(255,68,68,0.35)",
              background: "rgba(255,68,68,0.08)", color: "var(--red)", fontSize: 14, fontWeight: 800, cursor: "pointer",
            }}>
              Stop Browser Worker
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startWorker()}
              disabled={!connected || webgpu.supported === false || status === "downloading" || status === "connecting"}
              style={{
                width: "100%", height: 52, borderRadius: 8, border: "none",
                background: connected && webgpu.supported !== false ? "#FFFFFF" : "var(--bg-4)",
                color: connected && webgpu.supported !== false ? "#000" : "var(--text-muted)",
                fontSize: 14, fontWeight: 800,
                cursor: connected && webgpu.supported !== false ? "pointer" : "not-allowed",
              }}
            >
              {status === "downloading" || status === "connecting" ? "Starting…" : "Start Browser Worker"}
            </button>
          )}
          <p style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55, textAlign: "center" }}>
            Keeps running when you navigate to Console or Explorer.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{
      gridColumn: wide ? "span 2" : undefined,
      background: "var(--bg-3)", borderRadius: 8, padding: 10,
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
