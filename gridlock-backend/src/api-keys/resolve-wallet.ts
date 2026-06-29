import type { Context } from "hono";
import { config } from "../config.js";
import { verifyWalletAuthRequest } from "./wallet-auth.js";

export function resolveWallet(
  c: Context,
  action: string,
): { wallet: string } | { error: string } {
  if (config.insecureKeyManagement) {
    const wallet = c.req.header("x-gridlock-wallet")?.trim();
    if (!wallet) {
      return { error: "Missing X-Gridlock-Wallet (insecure dev mode)" };
    }
    return { wallet };
  }
  const verified = verifyWalletAuthRequest(action, c.req.raw.headers);
  if ("error" in verified) return verified;
  return verified;
}
