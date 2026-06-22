import { Hono } from "hono";
import { config } from "../config.js";
import { dbUpsertWorker } from "../db.js";
import { anchorRegisterWorker } from "../solana.js";
import { jobsStore, workersRegistry } from "../state.js";
import type { HeartbeatRequest, RegisterWorkerRequest, WorkerRecord } from "../types.js";

export const workerRoutes = new Hono();

workerRoutes.get("/v1/workers", (c) => {
  const role = c.req.query("role");
  const status = c.req.query("status");
  const teeRaw = c.req.query("tee_capable");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  let workers = workersRegistry.map((w) => ({ ...w }));
  if (role) workers = workers.filter((w) => w.role.toLowerCase() === role.toLowerCase());
  if (status) workers = workers.filter((w) => w.status.toLowerCase() === status.toLowerCase());
  if (teeRaw !== undefined) {
    const tee = teeRaw === "true";
    workers = workers.filter((w) => w.tee_capable === tee);
  }

  return c.json({ workers: workers.slice(0, limit), total: workers.length });
});

workerRoutes.get("/v1/workers/:address", (c) => {
  const address = c.req.param("address");
  const worker = workersRegistry.find((w) => w.address.startsWith(address));
  if (!worker) return c.json({ error: `Worker ${address} not found` }, 404);
  const recent = jobsStore
    .filter((j) => (j.worker_address ?? "").startsWith(address))
    .slice(-20)
    .reverse();
  return c.json({ ...worker, recent_jobs: recent });
});

workerRoutes.post("/v1/workers/register", async (c) => {
  const req = (await c.req.json()) as RegisterWorkerRequest;
  if (workersRegistry.some((w) => w.address === req.operator_pubkey)) {
    return c.json({ error: "Worker already registered" }, 409);
  }

  const tx = await anchorRegisterWorker(
    req.operator_pubkey,
    req.role,
    req.hardware_tier,
    req.tee_capable ?? false,
  );

  const newWorker: WorkerRecord = {
    address: req.operator_pubkey,
    role: req.role,
    endpoint: req.endpoint || config.vllmEndpoint,
    sla_tiers: ["batch", "standard"],
    tee_capable: req.tee_capable ?? false,
    reliability_score: 5000,
    goodput_score: 0,
    sla_pass_rate: 100.0,
    p99_ttft_ms: 0,
    status: "Active",
    staked_lock: 0,
    hardware_tier: req.hardware_tier,
    jobs_today: 0,
    earnings_today: 0,
    penalties_paid: 0,
    is_confidential: false,
    last_heartbeat: Date.now() / 1000,
    registered_at: Date.now() / 1000,
  };

  workersRegistry.push(newWorker);
  void dbUpsertWorker(newWorker);
  return c.json({ success: true, address: req.operator_pubkey, tx_sig: tx });
});

workerRoutes.post("/v1/workers/heartbeat", async (c) => {
  const req = (await c.req.json()) as HeartbeatRequest;
  const worker = workersRegistry.find((w) => w.address.startsWith(req.worker_address));
  if (!worker) return c.json({ error: "Worker not found" }, 404);

  worker.last_heartbeat = Date.now() / 1000;
  if (worker.status === "AutoGated") {
    worker.status = "Active";
    console.log(`[heartbeat] ${req.worker_address.slice(0, 8)}… recovered`);
  }
  if (req.goodput_score !== undefined) worker.goodput_score = req.goodput_score;
  if (req.p99_ttft_ms !== undefined) worker.p99_ttft_ms = req.p99_ttft_ms;

  return c.json({ ok: true, ts: worker.last_heartbeat, status: worker.status });
});
