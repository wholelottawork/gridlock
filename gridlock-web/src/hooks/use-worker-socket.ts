"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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

function wsBaseUrl(): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  return api.replace(/^http/, "ws") + "/v1/ws";
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

export function useWorkerSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<WsNetworkStats | null>(null);
  const onJobRef = useRef<((jobId: string, messages: WsJobMessage[], model: string) => void) | null>(null);

  const connect = useCallback(async (): Promise<void> => {
    const existing = wsRef.current;
    if (existing?.readyState === WebSocket.OPEN) return;
    if (existing?.readyState === WebSocket.CONNECTING) {
      await waitForOpen(existing, 10_000);
      return;
    }

    const ws = new WebSocket(wsBaseUrl());
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (msg.type === "stats:update") {
          setStats({
            ws_workers_online: Number(msg.ws_workers_online ?? 0),
            ws_workers_busy: Number(msg.ws_workers_busy ?? 0),
            ws_browser_workers: Number(msg.ws_browser_workers ?? 0),
            ws_native_workers: Number(msg.ws_native_workers ?? 0),
            jobs_in_queue: Number(msg.jobs_in_queue ?? 0),
            jobs_inflight: Number(msg.jobs_inflight ?? 0),
          });
        }
        if (msg.type === "job:new" && onJobRef.current) {
          onJobRef.current(
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
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const registerWorker = useCallback(
    (workerAddress: string, opts?: { model?: string; tokPerSec?: number; type?: "browser" | "native" }) => {
      safeSend(wsRef.current, {
        type: "worker:register",
        worker_address: workerAddress,
        model: opts?.model ?? "Llama-3.2-1B-Instruct-q4f16_1-MLC",
        tok_per_sec: opts?.tokPerSec ?? 0,
        worker_type: opts?.type ?? "browser",
      });
    },
    [],
  );

  const unregisterWorker = useCallback((workerAddress: string) => {
    safeSend(wsRef.current, { type: "worker:unregister", worker_address: workerAddress });
  }, []);

  const completeJob = useCallback(
    (jobId: string, response: string, tokensGenerated: number, ttftMs: number, tpotMs: number) => {
      safeSend(wsRef.current, {
        type: "job:complete",
        job_id: jobId,
        response,
        tokens_generated: tokensGenerated,
        ttft_ms: ttftMs,
        tpot_ms: tpotMs,
      });
    },
    [],
  );

  const failJob = useCallback((jobId: string, error: string) => {
    safeSend(wsRef.current, { type: "job:error", job_id: jobId, error });
  }, []);

  const setOnNewJob = useCallback(
    (handler: ((jobId: string, messages: WsJobMessage[], model: string) => void) | null) => {
      onJobRef.current = handler;
    },
    [],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    connected,
    stats,
    connect,
    disconnect,
    registerWorker,
    unregisterWorker,
    completeJob,
    failJob,
    setOnNewJob,
  };
}
