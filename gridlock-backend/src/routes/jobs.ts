import { Hono } from "hono";
import { jobsStore } from "../state.js";

export const jobRoutes = new Hono();

jobRoutes.get("/v1/jobs", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const slaTier = c.req.query("sla_tier");
  const slaMetRaw = c.req.query("sla_met");
  const workerFilter = c.req.query("worker");

  let jobs = [...jobsStore].reverse();
  if (slaTier) jobs = jobs.filter((j) => j.sla_tier === slaTier);
  if (slaMetRaw !== undefined) {
    const slaMet = slaMetRaw === "true";
    jobs = jobs.filter((j) => j.sla_met === slaMet);
  }
  if (workerFilter) {
    jobs = jobs.filter((j) => (j.worker_address ?? "").startsWith(workerFilter));
  }

  return c.json({ jobs: jobs.slice(offset, offset + limit), total: jobs.length, limit, offset });
});

jobRoutes.get("/v1/jobs/:jobId", (c) => {
  const job = jobsStore.find((j) => j.id === c.req.param("jobId"));
  if (!job) return c.json({ error: `Job ${c.req.param("jobId")} not found` }, 404);
  return c.json(job);
});
