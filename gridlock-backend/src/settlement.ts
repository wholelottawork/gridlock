import { config, PENALTY_MULT } from "./config.js";
import { dbInsertJob } from "./db.js";
import {
  anchorCommitReceipt,
  anchorDistributeFees,
  anchorSettleOrPenalize,
} from "./solana.js";
import { addLockBurned, broadcastEvent, jobsStore } from "./state.js";
import type { WorkerRecord } from "./types.js";

export async function settleJob(
  jobId: string,
  slaTier: string,
  ttftMs: number,
  tpotMs: number,
  slaMet: boolean,
  confidential: boolean,
  worker: WorkerRecord,
  fee: number,
): Promise<void> {
  const penalty = slaMet ? null : fee * PENALTY_MULT[slaTier]!;

  console.log(`[receipt] ${jobId.slice(0, 12)} tier=${slaTier} ttft=${ttftMs}ms ${slaMet ? "MET" : "MISS"}`);

  addLockBurned(fee * 0.1);

  await anchorCommitReceipt(jobId, slaTier, ttftMs, tpotMs, slaMet, confidential);
  if (!slaMet) await anchorSettleOrPenalize(jobId);
  await anchorDistributeFees(jobId, Math.floor(fee * 1_000_000));

  const job = jobsStore.find((j) => j.id === jobId);
  if (job) {
    job.status = "settled";
    await dbInsertJob(job);
  }

  broadcastEvent({
    type: "job",
    id: jobId,
    sla_tier: slaTier,
    ttft_ms: ttftMs,
    tpot_ms: tpotMs,
    sla_met: slaMet,
    penalty,
    worker: worker.address.slice(0, 8),
    ts: Date.now() / 1000,
  });
}

export { watcherSample } from "./watcher.js";
