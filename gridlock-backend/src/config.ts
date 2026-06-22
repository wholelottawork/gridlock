import "dotenv/config";
import { homedir } from "node:os";
import { join } from "node:path";

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  vllmEndpoint: process.env.VLLM_ENDPOINT ?? "http://localhost:8000",
  vllmApiKey: process.env.VLLM_API_KEY ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  routerKeypairPath: expandHome(process.env.ROUTER_KEYPAIR_PATH ?? "~/.config/solana/id.json"),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_KEY ?? "",
  watcherSampleRate: Number(process.env.WATCHER_SAMPLE_RATE ?? "0.05"),
  apiKeys: new Set(
    (process.env.API_KEYS ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  ),
};

export const OPEN_PATHS = new Set(["/health", "/v1/live"]);

export const PROGRAM_IDS = {
  providerRegistry: "FtcDkiVRPSjubZwNktwV1wNw8jvgvGHXHhYsTbvAf6T2",
  jobScheduler: "9FpypwgXqgNGsXrgTtzZ4G62tYB5vH8FZKBHzt3sCAJG",
  slaRegistry: "3vJZMJReLan77UZE5nJEZf2UrvwfBe5zv78LBre3UPZM",
  slaEnforcer: "4TVPu4tTHfHWLaj8Srbp6v89KHPcN1t5iijNxQrSR4ci",
  feeCollector: "4mrEY6MWLFCFA2wHuLqDxT6YzgsYaGjXDa4K1idqD79L",
};

export const SLA_TARGETS: Record<string, { ttft: number; tpot: number }> = {
  realtime: { ttft: 300, tpot: 60 },
  standard: { ttft: 800, tpot: 120 },
  batch: { ttft: 5000, tpot: 9999 },
  confidential: { ttft: 800, tpot: 120 },
};

export const PENALTY_MULT: Record<string, number> = {
  realtime: 2.0,
  standard: 1.0,
  batch: 0.25,
  confidential: 1.0,
};

const MODEL_BASE_FEE: Record<string, number> = {
  "llama-3.1-70b": 0.08,
  "llama-3.1-8b": 0.02,
  "mistral-7b": 0.02,
  "qwen2.5-72b": 0.07,
};

const TIER_FEE_MULT: Record<string, number> = {
  realtime: 2.0,
  standard: 1.0,
  batch: 0.4,
  confidential: 2.5,
};

export function computeFee(model: string, slaTier: string, promptTokens: number): number {
  const base = MODEL_BASE_FEE[model] ?? 0.05;
  const tier = TIER_FEE_MULT[slaTier] ?? 1.0;
  const scale = Math.max(1.0, promptTokens / 512);
  return Math.round(base * tier * scale * 10000) / 10000;
}
