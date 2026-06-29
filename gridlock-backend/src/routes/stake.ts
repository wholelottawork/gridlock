import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { resolveWalletRead } from "../api-keys/resolve-wallet.js";
import { buildStakeInfo, buildStakePosition } from "../staking/reads.js";

export const stakeRoutes = new Hono();

const STAKE_READ_ACTIONS = ["stake", "session"] as const;

stakeRoutes.get("/v1/stake/info", async (c) => {
  const info = await buildStakeInfo();
  return c.json(info);
});

/** Read-only — stake balances are public on-chain; wallet query avoids a signature prompt. */
stakeRoutes.get("/v1/stake/position", async (c) => {
  const walletQuery = c.req.query("wallet")?.trim();
  if (walletQuery) {
    try {
      new PublicKey(walletQuery);
    } catch {
      return c.json({ error: "Invalid wallet address" }, 400);
    }
    const position = await buildStakePosition(walletQuery);
    return c.json(position);
  }

  const auth = resolveWalletRead(c, STAKE_READ_ACTIONS);
  if ("error" in auth) {
    return c.json({ error: "wallet query parameter is required" }, 400);
  }

  const position = await buildStakePosition(auth.wallet);
  return c.json(position);
});
