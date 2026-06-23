import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import type { JobRecord, WorkerRecord } from "./types.js";

let sbClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (sbClient) return sbClient;
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  try {
    sbClient = createClient(config.supabaseUrl, config.supabaseKey);
    console.log("[supabase] client ready");
    return sbClient;
  } catch (error) {
    console.log(`[supabase] init failed: ${error}`);
    return null;
  }
}

function formatSupabaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string };
    return [e.code, e.message, e.details].filter(Boolean).join(": ") || JSON.stringify(error);
  }
  return String(error);
}

/** Map in-memory job to Supabase `jobs` row (columns from 001_initial.sql). */
function jobToRow(job: JobRecord): Record<string, unknown> {
  return {
    id: job.id,
    customer: job.customer,
    model: job.model,
    sla_tier: job.sla_tier,
    ttft_ms: job.ttft_ms,
    tpot_ms: job.tpot_ms,
    sla_met: job.sla_met,
    confidential: job.confidential,
    worker: job.worker,
    worker_address: job.worker_address,
    ts: job.ts,
    penalty_paid: job.penalty_paid ?? null,
    fee: job.fee,
    status: job.status,
    attestation_hash: job.attestation_hash ?? null,
  };
}

export async function dbInsertJob(job: JobRecord): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const row = jobToRow(job);
    const { error } = await sb.from("jobs").upsert(row, { onConflict: "id" });
    if (error) throw error;
    console.log(`[supabase] job saved ${job.id.slice(0, 8)} (${job.status})`);
  } catch (error) {
    console.log(`[supabase] insert_job failed: ${formatSupabaseError(error)}`);
  }
}

export async function dbUpsertWorker(worker: WorkerRecord): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const payload = {
      address: worker.address,
      role: worker.role,
      endpoint: worker.endpoint,
      sla_tiers: JSON.stringify(worker.sla_tiers),
      tee_capable: worker.tee_capable,
      reliability_score: Math.round(worker.reliability_score),
      goodput_score: Math.round(worker.goodput_score),
      sla_pass_rate: worker.sla_pass_rate,
      p99_ttft_ms: Math.round(worker.p99_ttft_ms),
      status: worker.status,
      staked_lock: Math.round(worker.staked_lock),
      hardware_tier: worker.hardware_tier,
      jobs_today: Math.round(worker.jobs_today),
      earnings_today: worker.earnings_today,
      penalties_paid: Math.round(worker.penalties_paid),
      is_confidential: worker.is_confidential,
      last_heartbeat: worker.last_heartbeat,
      registered_at: worker.registered_at,
    };
    const { error } = await sb.from("workers").upsert(payload, { onConflict: "address" });
    if (error) throw error;
  } catch (error) {
    console.log(`[supabase] upsert_worker failed: ${formatSupabaseError(error)}`);
  }
}

export async function dbLoadJobs(): Promise<JobRecord[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .order("ts", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as JobRecord[];
  } catch (error) {
    console.log(`[supabase] load_jobs failed: ${error}`);
    return [];
  }
}

export async function dbLoadWorkers(): Promise<WorkerRecord[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("workers").select("*");
    if (error) throw error;
    return (data ?? []).map((row) => {
      const worker = row as WorkerRecord & { sla_tiers: string | string[] };
      if (typeof worker.sla_tiers === "string") {
        worker.sla_tiers = JSON.parse(worker.sla_tiers) as string[];
      }
      return worker;
    });
  } catch (error) {
    console.log(`[supabase] load_workers failed: ${error}`);
    return [];
  }
}

export function supabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl);
}
