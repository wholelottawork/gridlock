const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { next: { revalidate: 0 } });
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

export interface ApiJob {
  job_id: string;
  worker_address: string;
  model: string;
  sla_tier: "realtime" | "standard" | "batch" | "confidential";
  ttft_ms: number;
  tpot_ms: number;
  sla_met: boolean;
  confidential: boolean;
  penalty_paid?: number;
  ts: number;
}

export interface ApiWorker {
  address: string;
  alias: string;
  region: string;
  tee_capable: boolean;
  status: "active" | "idle" | "offline";
  goodput: number;
  reliability: number;
  total_jobs: number;
  staked_lock: number;
  earned_lock: number;
  gpu_model: string;
  uptime: number;
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
}

export interface ApiLeaderEntry {
  address: string;
  alias: string;
  score: number;
  rank: number;
  tee_capable: boolean;
  sla_pass_rate: number;
  total_jobs: number;
}

// ─── Network Stats ────────────────────────────────────────────────────────────

export async function fetchNetworkStats(): Promise<ApiNetworkStats> {
  return get<ApiNetworkStats>("/v1/network/stats");
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
}): Promise<ApiWorker[]> {
  const qs = new URLSearchParams();
  if (params?.status)               qs.set("status",      params.status);
  if (params?.tee_capable !== undefined) qs.set("tee_capable", String(params.tee_capable));
  if (params?.limit)                qs.set("limit",       String(params.limit));
  return get<ApiWorker[]>(`/v1/workers?${qs}`);
}

export async function fetchWorker(address: string): Promise<ApiWorker> {
  return get<ApiWorker>(`/v1/workers/${address}`);
}

export async function registerWorker(body: {
  address: string;
  alias: string;
  region: string;
  tee_capable: boolean;
  gpu_model: string;
}): Promise<{ success: boolean; tx?: string }> {
  return post("/v1/workers/register", body);
}

export async function heartbeat(address: string): Promise<{ ok: boolean }> {
  return post("/v1/workers/heartbeat", { address });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function fetchLeaderboard(metric: "goodput" | "reliability" | "confidential" | "earnings", limit = 25): Promise<ApiLeaderEntry[]> {
  return get<ApiLeaderEntry[]>(`/v1/leaderboard?metric=${metric}&limit=${limit}`);
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{ status: string; solana_slot: number; programs: Record<string, string> }> {
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
