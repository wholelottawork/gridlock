import WebSocket from "ws";
import { wsUrl } from "./config.js";
import { detectGpuName } from "./gpu.js";
import {
  getActiveModel,
  resolveInferenceBackend,
  runBenchmark,
  runInference,
  type ChatMessage,
} from "./inference.js";
import type { InferenceBackend } from "./config.js";

interface WorkerOptions {
  wallet: string;
  backendUrl: string;
  benchmarkOnly?: boolean;
  inference?: InferenceBackend;
}

async function apiPost<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function ensureRegistered(wallet: string, backendUrl: string, hardwareTier: string) {
  try {
    const res = await fetch(`${backendUrl.replace(/\/$/, "")}/v1/workers/${wallet}`);
    if (res.ok) {
      await apiPost(backendUrl, "/v1/workers/heartbeat", {
        worker_address: wallet,
      });
      return;
    }
  } catch {
    /* register below */
  }

  await apiPost(backendUrl, "/v1/workers/register", {
    operator_pubkey: wallet,
    role: process.env.GRIDLOCK_ROLE ?? "Prefill",
    hardware_tier: hardwareTier,
    tee_capable: false,
    endpoint: `native://${hardwareTier.toLowerCase().replace(/\s+/g, "-")}`,
  });
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export async function startWorker(options: WorkerOptions): Promise<void> {
  const { wallet, backendUrl, benchmarkOnly, inference } = options;
  const hardwareTier = await detectGpuName();

  log(`Gridlock native worker`);
  log(`Wallet: ${wallet.slice(0, 8)}…`);
  log(`API: ${backendUrl}`);
  log(`GPU: ${hardwareTier}`);

  const backend = await resolveInferenceBackend(inference);
  log(`Inference: ${backend} (${getActiveModel()})`);

  log("Running benchmark…");
  const tokPerSec = await runBenchmark();
  log(`Benchmark: ${tokPerSec} tok/s`);

  if (benchmarkOnly) return;

  await ensureRegistered(wallet, backendUrl, hardwareTier);

  let activeJob: string | null = null;
  const modelName = getActiveModel();

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl(backendUrl));

    ws.on("open", () => {
      log("Connected to router");
      ws.send(
        JSON.stringify({
          type: "worker:register",
          worker_address: wallet,
          worker_type: "native",
          model: modelName,
          tok_per_sec: tokPerSec,
        }),
      );
      log("Registered for jobs");
    });

    ws.on("message", (raw) => {
      void (async () => {
        try {
          const msg = JSON.parse(String(raw)) as Record<string, unknown>;
          if (msg.type === "error") {
            log(`Error: ${String(msg.message ?? "unknown")}`);
            return;
          }
          if (msg.type !== "job:new" || activeJob) return;

          const jobId = String(msg.job_id);
          activeJob = jobId;
          log(`Job ${jobId.slice(0, 12)}…`);

          const messages = (msg.messages as ChatMessage[]) ?? [];
          try {
            const result = await runInference(messages);
            ws.send(
              JSON.stringify({
                type: "job:complete",
                job_id: jobId,
                response: result.content,
                tokens_generated: result.tokens,
                ttft_ms: result.ttftMs,
                tpot_ms: result.tpotMs,
              }),
            );
            log(`Job ${jobId.slice(0, 12)}… done (${result.tokens} tokens)`);
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: "job:error",
                job_id: jobId,
                error: e instanceof Error ? e.message : "Inference failed",
              }),
            );
            log(`Job ${jobId.slice(0, 12)}… failed`);
          } finally {
            activeJob = null;
          }
        } catch (e) {
          log(`Message error: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    });

    ws.on("close", () => {
      log("Disconnected");
      resolve();
    });

    ws.on("error", (err) => {
      reject(err);
    });
  });
}
