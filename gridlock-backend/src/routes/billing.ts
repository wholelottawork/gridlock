import { Hono } from "hono";
import { resolveWallet } from "../api-keys/resolve-wallet.js";
import {
  aggregateBilling,
  jobBelongsToWallet,
  mergeJobsById,
  monthStartTs,
} from "../billing/aggregate.js";
import { getCreditBalance, topupCredits } from "../billing/credits.js";
import { config } from "../config.js";
import { dbListApiKeysByWallet, dbLoadJobsForWallet, supabaseConfigured } from "../db.js";
import { jobsStore } from "../state.js";

export const billingRoutes = new Hono();

const MAX_DEV_TOPUP = 500;

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

  const creditBalance = config.billingEnabled ? await getCreditBalance(auth.wallet) : null;
  const summary = aggregateBilling(jobs, auth.wallet, sinceTs, keyNames);
  summary.credit_balance_lock = creditBalance;

  return c.json(summary);
});

billingRoutes.post("/v1/billing/topup", async (c) => {
  if (!config.billingDevTopup && !config.insecureKeyManagement) {
    return c.json({ error: "Top-up is disabled in production" }, 403);
  }

  const auth = resolveWallet(c, "topup");
  if ("error" in auth) return c.json({ error: auth.error }, 401);

  const body = (await c.req.json()) as { amount?: number };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: "amount must be a positive number" }, 400);
  }
  if (amount > MAX_DEV_TOPUP) {
    return c.json({ error: `amount exceeds dev limit (${MAX_DEV_TOPUP} $LOCK)` }, 400);
  }

  const balance = await topupCredits(auth.wallet, amount);
  return c.json({
    ok: true,
    credited: Math.round(amount * 10000) / 10000,
    balance_lock: balance,
  });
});
