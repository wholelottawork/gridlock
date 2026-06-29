import { Hono } from "hono";
import { resolveWallet } from "../api-keys/resolve-wallet.js";
import {
  aggregateBilling,
  jobBelongsToWallet,
  mergeJobsById,
  monthStartTs,
} from "../billing/aggregate.js";
import { dbListApiKeysByWallet, dbLoadJobsForWallet, supabaseConfigured } from "../db.js";
import { jobsStore } from "../state.js";

export const billingRoutes = new Hono();

billingRoutes.get("/v1/billing/summary", async (c) => {
  const auth = resolveWallet(c, "summary");
  if ("error" in auth) return c.json({ error: auth.error }, 401);

  const sinceTs = monthStartTs();
  const memoryJobs = jobsStore.filter(
    (j) => jobBelongsToWallet(j, auth.wallet) && j.ts >= sinceTs,
  );
  const dbJobs = supabaseConfigured()
    ? await dbLoadJobsForWallet(auth.wallet, sinceTs)
    : [];
  const jobs = mergeJobsById(dbJobs, memoryJobs);

  const keys = supabaseConfigured() ? await dbListApiKeysByWallet(auth.wallet) : [];
  const keyNames = new Map(
    keys.map((k) => [k.id, { name: k.name, key_prefix: k.key_prefix }]),
  );

  return c.json(aggregateBilling(jobs, auth.wallet, sinceTs, keyNames));
});
