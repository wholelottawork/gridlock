"use client";
import { useCallback, useEffect, useState } from "react";
import {
  WorkerSocketManager,
  type WsJobMessage,
  type WsNetworkStats,
} from "@/lib/worker-socket";

/** React hook over the persistent worker WebSocket singleton. */
export function useWorkerSocket() {
  const socket = WorkerSocketManager.getInstance();
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<WsNetworkStats | null>(null);

  useEffect(() => socket.subscribeConnected(setConnected), [socket]);
  useEffect(() => socket.subscribeStats(setStats), [socket]);

  const connect = useCallback(() => socket.connect(), [socket]);
  const disconnect = useCallback(() => socket.disconnect(), [socket]);
  const registerWorker = useCallback(
    (workerAddress: string, opts?: { model?: string; tokPerSec?: number; type?: "browser" | "native" }) =>
      socket.registerWorker(workerAddress, opts),
    [socket],
  );
  const unregisterWorker = useCallback(
    (workerAddress: string) => socket.unregisterWorker(workerAddress),
    [socket],
  );
  const completeJob = useCallback(
    (jobId: string, response: string, tokensGenerated: number, ttftMs: number, tpotMs: number) =>
      socket.completeJob(jobId, response, tokensGenerated, ttftMs, tpotMs),
    [socket],
  );
  const failJob = useCallback(
    (jobId: string, error: string) => socket.failJob(jobId, error),
    [socket],
  );
  const setOnNewJob = useCallback(
    (handler: ((jobId: string, messages: WsJobMessage[], model: string) => void) | null) =>
      socket.setOnNewJob(handler),
    [socket],
  );

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

export type { WsJobMessage, WsNetworkStats } from "@/lib/worker-socket";
