/** Same backend the desktop worker uses in production (api.reacton.dev). */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return "https://api.reacton.dev";
    }
  }
  return "http://localhost:8080";
}

const BASE_URL = resolveApiBaseUrl();

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Types matching the actual backend ───────────────────────────────────────

export interface ApiJob {
  id: string;
  customer: string;
  model: string;
  sla_tier: "realtime" | "standard" | "batch" | "confidential";
  ttft_ms: number;
  tpot_ms: number;
  sla_met: boolean;
  confidential: boolean;
  worker: string;
  worker_address: string;
  ts: number;
  penalty_paid?: number | null;
  fee: number;
  status: string;
  attestation_hash?: string | null;
}

export interface ApiWorker {
  address: string;
  role: string;
  endpoint: string;
  sla_tiers: string[];
  tee_capable: boolean;
  reliability_score: number;
  goodput_score: number;
  sla_pass_rate: number;
  p99_ttft_ms: number;
  status: string;
  staked_lock: number;
  hardware_tier: string;
  jobs_today: number;
  earnings_today: number;
  penalties_paid: number;
  is_confidential: boolean;
  last_heartbeat: number;
  registered_at: number;
  grid_points?: number;
  ws_online?: boolean;
  ws_worker_type?: "browser" | "native" | "desktop" | null;
  ws_busy?: boolean;
  ws_model?: string | null;
  ws_tok_per_sec?: number;
  in_flight?: number;
}

export interface ApiNetworkStats {
  active_workers: number;
  idle_workers: number;
  tee_workers: number;
  jobs_total: number;
  jobs_1h: number;
  sla_pass_rate: number;
  p99_ttft_ms: number;
  total_penalties_lock: number;
  confidential_share: number;
  lock_burned: number;
  total_workers: number;
  requests_today: number;
  cache_hit_entries: number;
  cache_hit_rate?: number;
  warm_path_rate?: number;
  prefill_workers?: number;
  decode_workers?: number;
}

export interface ChatGridlockMeta {
  job_id: string;
  ttft_ms: number;
  tpot_ms: number;
  sla_tier: string;
  sla_met: boolean;
  sla_target_ttft_ms: number;
  worker: string;
  confidential: boolean;
  penalty_due_lock?: number | null;
  fee_lock: number;
  attestation_hash?: string | null;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/** Send a chat completion. Pass the full conversation in `messages` — workers are stateless. */
export async function chatCompletion(opts: {
  model: string;
  messages: { role: string; content: string }[];
  sla?: string;
  privacy?: boolean;
}): Promise<{ content: string; meta: ChatGridlockMeta }> {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: false,
      gridlock: { sla: opts.sla ?? "standard", privacy: opts.privacy ?? false },
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new Error(err.error ?? `Chat API: ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.choices[0].message.content as string,
    meta: data.gridlock as ChatGridlockMeta,
  };
}

// ─── Network Stats ────────────────────────────────────────────────────────────

export async function fetchNetworkStats(): Promise<ApiNetworkStats> {
  return get<ApiNetworkStats>("/v1/network/stats");
}

export interface ApiTeeCapacity {
  tee_workers_registered: number;
  tee_workers_online: number;
  can_serve_confidential: boolean;
  online_addresses: string[];
}

export async function fetchTeeCapacity(): Promise<ApiTeeCapacity> {
  return get<ApiTeeCapacity>("/v1/capacity/tee");
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function fetchJobs(params?: {
  limit?: number;
  offset?: number;
  sla_tier?: string;
  sla_met?: boolean;
  worker?: string;
}): Promise<{ jobs: ApiJob[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit)    qs.set("limit",    String(params.limit));
  if (params?.offset)   qs.set("offset",   String(params.offset));
  if (params?.sla_tier) qs.set("sla_tier", params.sla_tier);
  if (params?.sla_met !== undefined) qs.set("sla_met", String(params.sla_met));
  if (params?.worker)   qs.set("worker",   params.worker);
  return get<{ jobs: ApiJob[]; total: number }>(`/v1/jobs?${qs}`);
}

export async function fetchJob(jobId: string): Promise<ApiJob> {
  return get<ApiJob>(`/v1/jobs/${jobId}`);
}

// ─── Workers ──────────────────────────────────────────────────────────────────

export async function fetchWorkers(params?: {
  status?: string;
  tee_capable?: boolean;
  limit?: number;
}): Promise<{ workers: ApiWorker[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.status)                    qs.set("status",      params.status);
  if (params?.tee_capable !== undefined) qs.set("tee_capable", String(params.tee_capable));
  if (params?.limit)                     qs.set("limit",       String(params.limit));
  return get<{ workers: ApiWorker[]; total: number }>(`/v1/workers?${qs}`);
}

export async function fetchWorker(address: string): Promise<ApiWorker & { recent_jobs: ApiJob[] }> {
  return get<ApiWorker & { recent_jobs: ApiJob[] }>(`/v1/workers/${address}`);
}

export async function registerWorker(body: {
  operator_pubkey: string;
  role: string;
  hardware_tier: string;
  tee_capable: boolean;
  endpoint?: string;
}): Promise<{ success: boolean; address: string; tx_sig?: string }> {
  return post("/v1/workers/register", body);
}

export async function heartbeat(address: string, goodput_score?: number): Promise<{ ok: boolean }> {
  return post("/v1/workers/heartbeat", { worker_address: address, goodput_score });
}

export type WorkerRuntimeStatus = "Active" | "Paused" | "Stopping";

export async function setWorkerStatus(
  address: string,
  status: WorkerRuntimeStatus,
): Promise<{ ok: boolean; status: string; in_flight?: number }> {
  return post(`/v1/workers/${address}/status`, { status });
}

export async function setWorkerConfidentialMode(
  address: string,
  enabled: boolean,
): Promise<{ ok: boolean; is_confidential: boolean }> {
  const res = await fetch(`${BASE_URL}/v1/workers/${address}/confidential`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `API confidential: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; is_confidential: boolean }>;
}

/** Register a new worker, or send heartbeat if this pubkey is already registered. */
export async function ensureWorkerRegistered(body: {
  operator_pubkey: string;
  role: string;
  hardware_tier: string;
  tee_capable: boolean;
  endpoint?: string;
}): Promise<{ success: boolean; address: string; tx_sig?: string }> {
  try {
    await fetchWorker(body.operator_pubkey);
    await heartbeat(body.operator_pubkey);
    return { success: true, address: body.operator_pubkey };
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) {
      return registerWorker(body);
    }
    throw e;
  }
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function fetchLeaderboard(
  metric: "goodput" | "reliability" | "confidential" | "earnings",
  limit = 25,
): Promise<{ metric: string; ranked: ApiWorker[]; total: number }> {
  return get<{ metric: string; ranked: ApiWorker[]; total: number }>(
    `/v1/leaderboard?metric=${metric}&limit=${limit}`,
  );
}

// ─── Cache & P/D stats ───────────────────────────────────────────────────────

export interface ApiCacheStats {
  hits: number;
  misses: number;
  entries: number;
  hit_rate: number;
  strategy: string;
}

export interface ApiPdStats {
  prefill_workers: number;
  decode_workers: number;
  cache_workers: number;
  router_workers: number;
  warm_cache_rate: number;
}

export async function fetchCacheStats(): Promise<ApiCacheStats> {
  return get<ApiCacheStats>("/v1/stats/cache");
}

export async function fetchPdStats(): Promise<ApiPdStats> {
  return get<ApiPdStats>("/v1/stats/pd");
}

// ─── Autoscale signal ─────────────────────────────────────────────────────────

export interface ApiAutoscaleSignal {
  recommendation: "stable" | "scale_up_prefill" | "scale_up_decode" | "scale_down";
  queue_pressure: number;
  ttft_pressure: number;
  scale_targets: { Prefill?: number; Decode?: number };
  active_workers: number;
  inflight: number;
}

export async function fetchAutoscaleSignal(): Promise<ApiAutoscaleSignal> {
  return get<ApiAutoscaleSignal>("/v1/autoscale/signal");
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{
  status: string;
  solana_slot: number;
  active_workers: number;
  total_workers: number;
  jobs_tracked: number;
  redis: string;
  supabase: string;
  programs: Record<string, string>;
}> {
  return get("/health");
}

// ─── Live SSE stream ─────────────────────────────────────────────────────────

export function subscribeLive(onEvent: (data: unknown) => void): () => void {
  const es = new EventSource(`${BASE_URL}/v1/live`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed */ }
  };
  es.onerror = () => es.close();
  return () => es.close();
}
