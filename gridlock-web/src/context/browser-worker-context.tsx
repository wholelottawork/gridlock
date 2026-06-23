"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";
import { useWebGPU } from "@/hooks/use-webgpu";
import { ensureWorkerRegistered, setWorkerStatus } from "@/lib/api-client";
import { prepareInferenceMessages } from "@/lib/job-messages";
import { WorkerSocketManager, type WsNetworkStats } from "@/lib/worker-socket";

export const BROWSER_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export type BrowserWorkerStatus =
  | "offline"
  | "initializing"
  | "downloading"
  | "connecting"
  | "ready"
  | "working"
  | "error";

interface BrowserWorkerContextValue {
  status: BrowserWorkerStatus;
  error: string | null;
  loadProgress: number;
  loadText: string;
  uptime: number;
  jobsCompleted: number;
  currentJobId: string | null;
  benchmarkTokPerSec: number;
  earningsToday: number;
  socketConnected: boolean;
  socketStats: WsNetworkStats | null;
  startWorker: () => Promise<void>;
  stopWorker: () => Promise<void>;
}

const BrowserWorkerContext = createContext<BrowserWorkerContextValue | null>(null);

export function BrowserWorkerProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useWallet();
  const webgpu = useWebGPU();
  const socket = WorkerSocketManager.getInstance();

  const [status, setStatus] = useState<BrowserWorkerStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState("");
  const [uptime, setUptime] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [benchmarkTokPerSec, setBenchmarkTokPerSec] = useState(0);
  const [earningsToday] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketStats, setSocketStats] = useState<WsNetworkStats | null>(null);

  const engineRef = useRef<MLCEngine | null>(null);
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeWalletRef = useRef<string | null>(null);
  const walletAddr = connected && publicKey ? publicKey.toBase58() : null;

  useEffect(() => socket.subscribeConnected(setSocketConnected), [socket]);
  useEffect(() => socket.subscribeStats(setSocketStats), [socket]);

  const stopWorker = useCallback(async () => {
    const addr = activeWalletRef.current;
    if (addr) socket.unregisterWorker(addr);
    socket.disconnect();
    activeWalletRef.current = null;

    if (engineRef.current) {
      try {
        await engineRef.current.unload();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    }

    if (uptimeRef.current) {
      clearInterval(uptimeRef.current);
      uptimeRef.current = null;
    }

    setStatus("offline");
    setUptime(0);
    setLoadProgress(0);
    setCurrentJobId(null);
    setError(null);
  }, [socket]);

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
        const tpotMs =
          outputTokens > 1 && firstTokenTs
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
    if (status === "ready" || status === "working" || status === "downloading" || status === "connecting") {
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
      activeWalletRef.current = walletAddr;

      setStatus("connecting");
      await setWorkerStatus(walletAddr, "Active");
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
      await stopWorker();
    }
  }, [walletAddr, webgpu, socket, stopWorker, status]);

  // Stop if wallet disconnects while worker is active.
  useEffect(() => {
    if (!connected && (status === "ready" || status === "working")) {
      void stopWorker();
    }
  }, [connected, status, stopWorker]);

  // Unregister when the tab closes.
  useEffect(() => {
    const onPageHide = () => {
      const addr = activeWalletRef.current;
      if (addr) socket.unregisterWorker(addr);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [socket]);

  const value: BrowserWorkerContextValue = {
    status,
    error,
    loadProgress,
    loadText,
    uptime,
    jobsCompleted,
    currentJobId,
    benchmarkTokPerSec,
    earningsToday,
    socketConnected,
    socketStats,
    startWorker,
    stopWorker,
  };

  return (
    <BrowserWorkerContext.Provider value={value}>
      {children}
    </BrowserWorkerContext.Provider>
  );
}

export function useBrowserWorker() {
  const ctx = useContext(BrowserWorkerContext);
  if (!ctx) {
    throw new Error("useBrowserWorker must be used within BrowserWorkerProvider");
  }
  return ctx;
}
