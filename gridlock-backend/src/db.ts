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

export async function dbInsertJob(job: JobRecord): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const { data, error } = await sb.from("jobs").insert(job);
    if (error) throw error;
    console.log(`[supabase] job saved ${job.id.slice(0, 8)}:`, data);
  } catch (error) {
    console.log(`[supabase] insert_job failed: ${error}`);
  }
}

export async function dbUpsertWorker(worker: WorkerRecord): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const payload = { ...worker, sla_tiers: JSON.stringify(worker.sla_tiers) };
    const { error } = await sb.from("workers").upsert(payload, { onConflict: "address" });
    if (error) throw error;
  } catch (error) {
    console.log(`[supabase] upsert_worker failed: ${error}`);
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
