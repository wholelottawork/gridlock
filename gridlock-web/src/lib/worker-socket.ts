export interface WsJobMessage {
  role: string;
  content: string;
}

export interface WsNetworkStats {
  ws_workers_online: number;
  ws_workers_busy: number;
  ws_browser_workers: number;
  ws_native_workers: number;
  jobs_in_queue: number;
  jobs_inflight: number;
}

type JobHandler = (jobId: string, messages: WsJobMessage[], model: string) => void;
type StatsListener = (stats: WsNetworkStats | null) => void;
type ConnectedListener = (connected: boolean) => void;

import { resolveApiBaseUrl } from "./api-client";

function wsBaseUrl(): string {
  return resolveApiBaseUrl().replace(/^http/, "ws") + "/v1/ws";
}

function safeSend(ws: WebSocket | null, data: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("WebSocket connection timeout"));
    }, timeoutMs);

    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onFail = () => {
      cleanup();
      reject(new Error("WebSocket connection failed"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onFail);
      ws.removeEventListener("close", onFail);
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onFail);
    ws.addEventListener("close", onFail);
  });
}

/** Singleton WebSocket client — survives route changes while the app is open. */
export class WorkerSocketManager {
  private static instance: WorkerSocketManager | null = null;

  static getInstance(): WorkerSocketManager {
    if (!WorkerSocketManager.instance) {
      WorkerSocketManager.instance = new WorkerSocketManager();
    }
    return WorkerSocketManager.instance;
  }

  private ws: WebSocket | null = null;
  private connected = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private stats: WsNetworkStats | null = null;
  private onJob: JobHandler | null = null;
  private statsListeners = new Set<StatsListener>();
  private connectedListeners = new Set<ConnectedListener>();

  getConnected() {
    return this.connected;
  }

  getStats() {
    return this.stats;
  }

  subscribeStats(listener: StatsListener) {
    this.statsListeners.add(listener);
    listener(this.stats);
    return () => {
      this.statsListeners.delete(listener);
    };
  }

  subscribeConnected(listener: ConnectedListener) {
    this.connectedListeners.add(listener);
    listener(this.connected);
    return () => {
      this.connectedListeners.delete(listener);
    };
  }

  setOnNewJob(handler: JobHandler | null) {
    this.onJob = handler;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await waitForOpen(this.ws, 10_000);
      return;
    }

    const ws = new WebSocket(wsBaseUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.setConnected(true);
      this.startKeepalive();
    };
    ws.onclose = () => {
      this.stopKeepalive();
      this.ws = null;
      this.setConnected(false);
    };
    ws.onerror = () => this.setConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (msg.type === "stats:update") {
          this.stats = {
            ws_workers_online: Number(msg.ws_workers_online ?? 0),
            ws_workers_busy: Number(msg.ws_workers_busy ?? 0),
            ws_browser_workers: Number(msg.ws_browser_workers ?? 0),
            ws_native_workers: Number(msg.ws_native_workers ?? 0),
            jobs_in_queue: Number(msg.jobs_in_queue ?? 0),
            jobs_inflight: Number(msg.jobs_inflight ?? 0),
          };
          for (const listener of this.statsListeners) listener(this.stats);
        }
        if (msg.type === "job:new" && this.onJob) {
          this.onJob(
            String(msg.job_id),
            (msg.messages as WsJobMessage[]) ?? [],
            String(msg.model ?? ""),
          );
        }
      } catch {
        /* ignore */
      }
    };

    await waitForOpen(ws, 10_000);
  }

  disconnect() {
    this.stopKeepalive();
    this.ws?.close();
    this.ws = null;
    this.setConnected(false);
  }

  private startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      safeSend(this.ws, { type: "ping" });
    }, 30_000);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  registerWorker(
    workerAddress: string,
    opts?: { model?: string; tokPerSec?: number; type?: "browser" | "native" },
  ) {
    safeSend(this.ws, {
      type: "worker:register",
      worker_address: workerAddress,
      model: opts?.model ?? "Llama-3.2-1B-Instruct-q4f16_1-MLC",
      tok_per_sec: opts?.tokPerSec ?? 0,
      worker_type: opts?.type ?? "browser",
    });
  }

  unregisterWorker(workerAddress: string) {
    safeSend(this.ws, { type: "worker:unregister", worker_address: workerAddress });
  }

  completeJob(
    jobId: string,
    response: string,
    tokensGenerated: number,
    ttftMs: number,
    tpotMs: number,
  ) {
    safeSend(this.ws, {
      type: "job:complete",
      job_id: jobId,
      response,
      tokens_generated: tokensGenerated,
      ttft_ms: ttftMs,
      tpot_ms: tpotMs,
    });
  }

  failJob(jobId: string, error: string) {
    safeSend(this.ws, { type: "job:error", job_id: jobId, error });
  }

  private setConnected(connected: boolean) {
    this.connected = connected;
    for (const listener of this.connectedListeners) listener(connected);
  }
}
