"use client";
import type { ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWebGPU } from "@/hooks/use-webgpu";
import {
  useBrowserWorker,
  BROWSER_MODEL,
  type BrowserWorkerStatus,
} from "@/context/browser-worker-context";
import { fmt } from "@/lib/utils";
import { WorkerAlert } from "@/components/worker/worker-alert";
import { WorkerStatBox, WorkerStatSection } from "@/components/worker/worker-stat-box";

function formatUptime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function statusDisplay(status: BrowserWorkerStatus): { label: string; color: string; pulse: boolean } {
  switch (status) {
    case "ready":
      return { label: "Ready", color: "var(--green)", pulse: true };
    case "working":
      return { label: "Working", color: "var(--green)", pulse: true };
    case "initializing":
    case "downloading":
    case "connecting":
      return { label: "Starting…", color: "var(--orange)", pulse: true };
    case "error":
      return { label: "Error", color: "var(--red)", pulse: false };
    default:
      return { label: "Not Ready", color: "var(--text-muted)", pulse: false };
  }
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

  const isActive = status === "ready" || status === "working";
  const isStarting = status === "initializing" || status === "downloading" || status === "connecting";
  const canStart = connected && webgpu.supported !== false && !isStarting;
  const hasSession = isActive || uptime > 0 || jobsCompleted > 0 || benchmarkTokPerSec > 0;
  const badge = statusDisplay(status);

  return (
    <div className="card">
      <BrowserWorkerHeader badge={badge} />

      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
        Runs entirely in your browser — no install. Uses WebGPU to serve jobs while this tab stays open.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {!connected && (
          <WorkerAlert variant="warning">
            Connect wallet to start.
          </WorkerAlert>
        )}
        {webgpu.supported === false && !webgpu.loading && (
          <WorkerAlert variant="error">
            WebGPU required — use Chrome or Edge on desktop.
          </WorkerAlert>
        )}
        {error && <WorkerAlert variant="error">{error}</WorkerAlert>}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: hasSession ? "1fr 1fr" : "1fr",
        gap: 16,
        marginTop: 16,
        alignItems: "start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <WorkerStatSection title="HARDWARE">
            <WorkerStatBox label="GPU" value={webgpu.loading ? "Detecting…" : webgpu.gpuName ?? "—"} />
            <WorkerStatBox
              label="VRAM"
              value={webgpu.estimatedVramGb != null ? `~${webgpu.estimatedVramGb} GB` : "—"}
            />
          </WorkerStatSection>

          <BrowserWorkerActions
            isActive={isActive}
            isStarting={isStarting}
            canStart={canStart}
            onStart={() => void startWorker()}
            onStop={() => void stopWorker()}
          />
        </div>

        {hasSession && (
          <WorkerStatSection title="SESSION">
            <WorkerStatBox label="EARNED" value={earningsToday.toFixed(2)} />
            <WorkerStatBox label="UPTIME" value={formatUptime(uptime)} />
            <WorkerStatBox label="JOBS" value={fmt(jobsCompleted, 0)} />
            <WorkerStatBox
              label="TOK/S"
              value={benchmarkTokPerSec > 0 ? benchmarkTokPerSec.toFixed(1) : "—"}
            />
          </WorkerStatSection>
        )}
      </div>

      <BrowserWorkerActivity
        status={status}
        loadText={loadText}
        loadProgress={loadProgress}
        currentJobId={currentJobId}
      />
    </div>
  );
}

function BrowserWorkerHeader({
  badge,
}: {
  badge: { label: string; color: string; pulse: boolean };
}) {
  const modelLabel = BROWSER_MODEL.split("-").slice(0, 2).join(" ");

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
      gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Browser Worker</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          WebLLM · {modelLabel} · in-tab via WebGPU
        </div>
      </div>
      <span style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        color: badge.color,
        flexShrink: 0,
      }}>
        <span
          className={badge.pulse ? "pulse" : ""}
          style={{ width: 6, height: 6, borderRadius: "50%", background: badge.color }}
        />
        {badge.label}
      </span>
    </div>
  );
}

function BrowserWorkerActions({
  isActive,
  isStarting,
  canStart,
  onStart,
  onStop,
}: {
  isActive: boolean;
  isStarting: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (isActive) {
    return (
      <button
        type="button"
        onClick={onStop}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 8,
          border: "1px solid rgba(255,68,68,0.35)",
          background: "rgba(255,68,68,0.08)",
          color: "var(--red)",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Stop Browser Worker
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={!canStart}
      style={{
        width: "100%",
        height: 52,
        borderRadius: 8,
        border: "none",
        background: canStart ? "#FFFFFF" : "var(--bg-4)",
        color: canStart ? "#000" : "var(--text-muted)",
        fontSize: 14,
        fontWeight: 800,
        cursor: canStart ? "pointer" : "not-allowed",
      }}
    >
      {isStarting ? "Starting…" : "Start Browser Worker"}
    </button>
  );
}

function BrowserWorkerActivity({
  status,
  loadText,
  loadProgress,
  currentJobId,
}: {
  status: BrowserWorkerStatus;
  loadText: string;
  loadProgress: number;
  currentJobId: string | null;
}) {
  const isLoading = status === "downloading" || status === "initializing";

  let content: ReactNode = null;

  if (isLoading) {
    content = (
      <div style={{ width: "100%" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
          fontSize: 11,
          color: "var(--text-muted)",
        }}>
          <span>{loadText}</span>
          <span>{Math.round(loadProgress * 100)}%</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${loadProgress * 100}%`, background: "var(--orange)" }}
          />
        </div>
      </div>
    );
  } else if (status === "connecting") {
    content = (
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Connecting to router…
      </div>
    );
  } else if (currentJobId) {
    content = (
      <div style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,160,0,0.08)",
        border: "1px solid rgba(255,160,0,0.2)",
        fontSize: 12,
      }}>
        Processing job{" "}
        <span style={{ fontFamily: "monospace", color: "var(--orange)" }}>
          {currentJobId.slice(0, 12)}…
        </span>
      </div>
    );
  } else if (status === "ready") {
    content = (
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Waiting for jobs…
      </div>
    );
  }

  if (!content) return null;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      {content}
    </div>
  );
}
