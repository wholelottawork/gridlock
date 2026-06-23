"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";
import { useWebGPU } from "@/hooks/use-webgpu";
import { useWorkerSocket } from "@/hooks/use-worker-socket";
import { fetchNetworkStats, ensureWorkerRegistered, type ApiNetworkStats } from "@/lib/api-client";
import { prepareInferenceMessages } from "@/lib/job-messages";
import { fmt } from "@/lib/utils";
import { NetworkGraph } from "@/components/worker/network-graph";

const BROWSER_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

type WorkerStatus = "offline" | "initializing" | "downloading" | "connecting" | "ready" | "working" | "error";

function formatUptime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function BrowserWorkerPanel() {
  const { publicKey, connected } = useWallet();
  const webgpu = useWebGPU();
  const socket = useWorkerSocket();

  const [status, setStatus] = useState<WorkerStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState("");
  const [uptime, setUptime] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [benchmarkTokPerSec, setBenchmarkTokPerSec] = useState(0);
  const [network, setNetwork] = useState<ApiNetworkStats | null>(null);
  const [earningsToday, setEarningsToday] = useState(0);

  const engineRef = useRef<MLCEngine | null>(null);
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopWorkerRef = useRef<() => Promise<void>>(async () => {});
  const walletAddr = connected && publicKey ? publicKey.toBase58() : null;

  useEffect(() => {
    const load = () => fetchNetworkStats().then(setNetwork).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const processJob = useCallback(
    async (jobId: string, messages: { role: string; content: string }[]) => {
      if (!engineRef.current) {
        socket.failJob(jobId, "Engine not ready");
        return;
      }

      setStatus("working");
      setCurrentJobId(jobId);
      const start = performance.now();
      let firstTokenTs: number | null = null;
      let tokens = 0;
      let full = "";

      try {
        if (typeof (engineRef.current as unknown as { resetChat?: () => Promise<void> }).resetChat === "function") {
          await (engineRef.current as unknown as { resetChat: () => Promise<void> }).resetChat();
        }

        const withSystem = prepareInferenceMessages(messages);

        const stream = await engineRef.current.chat.completions.create({
          messages: withSystem,
          temperature: 0.7,
          max_tokens: 256,
          stream: true,
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (!text) continue;
          if (firstTokenTs === null) firstTokenTs = performance.now();
          full += text;
          tokens += 1;
        }

        const ttftMs = firstTokenTs ? Math.floor(firstTokenTs - start) : Math.floor(performance.now() - start);
        const outputTokens = Math.max(tokens, 1);
        const tpotMs = outputTokens > 1 && firstTokenTs
          ? Math.floor((performance.now() - firstTokenTs) / (outputTokens - 1))
          : 0;

        socket.completeJob(jobId, full.trim() || "(empty)", tokens, ttftMs, tpotMs);
        setJobsCompleted((n) => n + 1);
      } catch (e) {
        socket.failJob(jobId, e instanceof Error ? e.message : "Inference failed");
      } finally {
        setStatus("ready");
        setCurrentJobId(null);
      }
    },
    [socket],
  );

  useEffect(() => {
    socket.setOnNewJob((jobId, messages) => {
      void processJob(jobId, messages);
    });
    return () => socket.setOnNewJob(null);
  }, [socket, processJob]);

  const stopWorker = useCallback(async () => {
    if (walletAddr) socket.unregisterWorker(walletAddr);
    socket.disconnect();
    if (engineRef.current) {
      try { await engineRef.current.unload(); } catch { /* ignore */ }
      engineRef.current = null;
    }
    if (uptimeRef.current) clearInterval(uptimeRef.current);
    setStatus("offline");
    setUptime(0);
    setLoadProgress(0);
    setCurrentJobId(null);
  }, [socket, walletAddr]);

  const startWorker = useCallback(async () => {
    if (!walletAddr) {
      setError("Connect your wallet first.");
      setStatus("error");
      return;
    }
    if (!webgpu.supported) {
      setError("WebGPU is required for browser inference.");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("initializing");

    try {
      await ensureWorkerRegistered({
        operator_pubkey: walletAddr,
        role: "Prefill",
        hardware_tier: webgpu.gpuName ?? "WebGPU Browser",
        tee_capable: false,
        endpoint: "browser://webgpu",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      return;
    }

    setStatus("downloading");
    setLoadText("Loading model…");

    try {
      const engine = await CreateMLCEngine(BROWSER_MODEL, {
        initProgressCallback: (report: InitProgressReport) => {
          setLoadProgress(report.progress);
          setLoadText(report.text);
        },
      });

      setLoadText("Benchmarking…");
      const benchStart = performance.now();
      const bench = await engine.chat.completions.create({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 8,
      });
      const benchText = bench.choices[0]?.message?.content ?? "";
      const benchTokens = benchText.split(/\s+/).filter(Boolean).length || 1;
      const tokPerSec = Math.round((benchTokens / ((performance.now() - benchStart) / 1000)) * 10) / 10;
      setBenchmarkTokPerSec(tokPerSec);

      engineRef.current = engine;

      setStatus("connecting");
      await socket.connect();

      socket.registerWorker(walletAddr, {
        model: BROWSER_MODEL,
        tokPerSec,
        type: "browser",
      });

      setStatus("ready");
      setUptime(0);
      uptimeRef.current = setInterval(() => setUptime((u) => u + 1), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start worker");
      setStatus("error");
      void stopWorker();
    }
  }, [walletAddr, webgpu, socket, stopWorker]);

  stopWorkerRef.current = stopWorker;
  useEffect(() => () => { void stopWorkerRef.current(); }, []);

  const isReady = status === "ready" || status === "working";
  const statusLabel =
    status === "ready" ? "Ready"
    : status === "working" ? "Working"
    : status === "connecting" ? "Connecting"
    : status === "downloading" || status === "initializing" ? "Loading"
    : status === "error" ? "Error"
    : "Offline";

  const statusColor =
    status === "ready" ? "var(--green)"
    : status === "working" ? "var(--orange)"
    : status === "error" ? "var(--red)"
    : "var(--text-muted)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!connected && (
        <div className="card" style={{ borderColor: "rgba(255,160,0,0.25)", background: "rgba(255,160,0,0.04)" }}>
          <div style={{ fontSize: 13, color: "var(--orange)", lineHeight: 1.6 }}>
            Connect your wallet with <strong>CONNECT</strong> to run a browser worker.
          </div>
        </div>
      )}

      {webgpu.supported === false && !webgpu.loading && (
        <div className="card" style={{ borderColor: "rgba(255,68,68,0.3)", background: "rgba(255,68,68,0.06)" }}>
          <div style={{ fontSize: 13, color: "var(--red)", lineHeight: 1.6 }}>
            WebGPU is not available. Use Chrome or Edge on desktop.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Browser Worker</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                WebLLM · {BROWSER_MODEL.split("-").slice(0, 2).join(" ")}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: statusColor }}>
              <span className={isReady ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
              {statusLabel}
              {socket.connected && <span style={{ color: "var(--green)", marginLeft: 4 }}>· WS</span>}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>GPU</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{webgpu.loading ? "Detecting…" : webgpu.gpuName ?? "—"}</div>
            </div>
            <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>Est. VRAM</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {webgpu.estimatedVramGb != null ? `~${webgpu.estimatedVramGb} GB` : "—"}
              </div>
            </div>
          </div>

          {(isReady || status === "downloading" || status === "initializing" || status === "connecting") && (
            <div style={{ height: 48, marginBottom: 12, display: "flex", alignItems: "center" }}>
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
                  width: "100%", height: 40, padding: "0 10px", borderRadius: 8,
                  display: "flex", alignItems: "center",
                  background: "rgba(255,160,0,0.08)", border: "1px solid rgba(255,160,0,0.2)", fontSize: 12,
                }}>
                  Processing job{" "}
                  <span style={{ fontFamily: "monospace", color: "var(--orange)", marginLeft: 4 }}>
                    {currentJobId.slice(0, 12)}…
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.25)", fontSize: 13, color: "var(--red)" }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
            {[
              { label: "EARNED TODAY", value: earningsToday.toFixed(2), unit: "$LOCK" },
              { label: "UPTIME", value: formatUptime(uptime), unit: "" },
              { label: "JOBS", value: fmt(jobsCompleted, 0), unit: "session" },
              { label: "TOK/S", value: benchmarkTokPerSec > 0 ? benchmarkTokPerSec.toFixed(1) : "—", unit: "bench" },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

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

          <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
            Jobs arrive over WebSocket from the router. Chat requests in Console route here when your worker is online.
          </p>
        </div>

        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>NETWORK</div>
          <div style={{ height: 160 }}>
            <NetworkGraph
              activeWorkers={network?.active_workers ?? socket.stats?.ws_workers_online ?? 0}
              totalWorkers={network?.total_workers ?? 0}
              isYouActive={isReady}
            />
          </div>
          {(socket.stats || network) && (
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {socket.stats && (
                <div>{socket.stats.ws_workers_online} WS workers · {socket.stats.jobs_in_queue} queued</div>
              )}
              {network && (
                <div>{network.jobs_total} jobs · p99 {network.p99_ttft_ms}ms</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
