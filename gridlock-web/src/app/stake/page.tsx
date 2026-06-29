"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const LOCK_MINT = process.env.NEXT_PUBLIC_LOCK_MINT ?? "";

/** On-chain passive staking (deposit / unstake) — Phase C. */
const STAKING_ACTIONS_ENABLED = false;

const PROTOCOL_APY = "8%";

const multiplierTiers = [
  { min: 0, max: 4999, mult: "1.0x", label: "Base", color: "var(--text-secondary)" },
  { min: 5000, max: 14999, mult: "1.5x", label: "Bronze", color: "var(--yellow)" },
  { min: 15000, max: 49999, mult: "2.0x", label: "Silver", color: "var(--text-primary)" },
  { min: 50000, max: 999999, mult: "3.0x", label: "Gold", color: "var(--orange)" },
];

const workerTierCollateral = [
  { tier: "Batch", collateral: 1000, ttft: "< 5s", penalty: "0.25x fee" },
  { tier: "Standard", collateral: 5000, ttft: "< 800ms", penalty: "1x fee" },
  { tier: "Realtime", collateral: 15000, ttft: "< 300ms", penalty: "2x fee" },
  { tier: "Confidential", collateral: 20000, ttft: "< 800ms + TEE", penalty: "1x + slash" },
];

function formatLock(amount: number | null, loading: boolean): string {
  if (loading) return "…";
  if (amount === null) return "—";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function StakePage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [mounted, setMounted] = useState(false);

  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [lockBalance, setLockBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  /** Passive staker vault balance — 0 until on-chain staking is wired (Phase B/C). */
  const stakedLock = connected && mounted ? 0 : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!publicKey || !LOCK_MINT) {
      setLockBalance(null);
      setBalanceError(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    void (async () => {
      try {
        const mint = new PublicKey(LOCK_MINT);
        const ata = getAssociatedTokenAddressSync(mint, publicKey, false, TOKEN_2022_PROGRAM_ID);
        const acct = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
        setLockBalance(Number(acct.amount) / 1e9);
      } catch {
        setLockBalance(0);
        setBalanceError("No $LOCK token account — get devnet $LOCK or use Billing to deposit.");
      } finally {
        setBalanceLoading(false);
      }
    })();
  }, [publicKey, connection]);

  const walletBalance = connected ? lockBalance : null;
  const stakeNum = parseFloat(stakeAmount) || 0;
  const previewStakeTotal = (stakedLock ?? 0) + stakeNum;
  const previewTier =
    multiplierTiers.find((t) => previewStakeTotal >= t.min && previewStakeTotal <= t.max) ?? multiplierTiers[0];

  const isWalletRequired = mounted && !connected;
  const walletBalanceLive = mounted && connected && !balanceLoading && lockBalance !== null && !balanceError;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Stake $LOCK</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700, lineHeight: 1.6 }}>
          Passive staking earns a share of network fees (60% staker pool) at a target {PROTOCOL_APY} APY.
          On-chain deposit and unstake are not live yet — your wallet balance below is read from devnet.
        </p>
      </div>

      {!STAKING_ACTIONS_ENABLED && mounted && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 18px",
            borderRadius: 8,
            background: "rgba(255,160,0,0.06)",
            border: "1px solid rgba(255,160,0,0.22)",
            fontSize: 13,
            color: "var(--text-primary)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--orange)" }}>Staking actions coming soon.</strong>{" "}
          Fee split and APY match the on-chain FeeCollector program; stake / unstake transactions will ship in the next phase.
        </div>
      )}

      {isWalletRequired && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 18px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            fontSize: 13,
            color: "var(--text-primary)",
            fontWeight: 700,
          }}
        >
          Connect your wallet (top right) to see your $LOCK wallet balance.
        </div>
      )}

      {mounted && connected && balanceError && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 6,
            background: "rgba(255,60,60,0.05)",
            border: "1px solid rgba(255,60,60,0.2)",
            fontSize: 12,
            color: "var(--red)",
          }}
        >
          {balanceError}
        </div>
      )}

      {!LOCK_MINT && mounted && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-muted)",
            fontWeight: 700,
          }}
        >
          Set <code>NEXT_PUBLIC_LOCK_MINT</code> in <code>.env.local</code> to read wallet balances.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "YOUR STAKED $LOCK",
            value: formatLock(stakedLock, false),
            accent: "var(--orange)",
            badge: connected ? "NOT STAKED" : null,
            badgeColor: "var(--text-muted)",
          },
          {
            label: "WALLET BALANCE",
            value: formatLock(walletBalance, balanceLoading),
            accent: "var(--text-primary)",
            badge: walletBalanceLive ? "LIVE" : connected ? null : null,
            badgeColor: "var(--green)",
          },
          {
            label: "EARNINGS MULTIPLIER",
            value: stakedLock === 0 ? "—" : previewTier.mult,
            accent: "var(--text-muted)",
            badge: "PLANNED",
            badgeColor: "var(--text-muted)",
          },
          {
            label: "TARGET APY",
            value: PROTOCOL_APY,
            accent: "var(--green)",
            badge: "ON-CHAIN",
            badgeColor: "var(--text-muted)",
          },
        ].map((s) => (
          <div key={s.label} className="card">
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontWeight: 700,
                letterSpacing: "1px",
                marginBottom: 10,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
            {s.badge && (
              <div style={{ fontSize: 10, color: s.badgeColor, fontWeight: 700, marginTop: 6 }}>{s.badge}</div>
            )}
          </div>
        ))}
      </div>

      <div className="card card-orange" style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontWeight: 700,
            letterSpacing: "1px",
            marginBottom: 14,
          }}
        >
          FEE REVENUE SPLIT (PROTOCOL)
        </div>
        <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", height: 6 }}>
          {[
            { pct: 60, color: "var(--orange)" },
            { pct: 20, color: "var(--orange-2)" },
            { pct: 10, color: "var(--orange-3)" },
            { pct: 10, color: "var(--bg-4)" },
          ].map((s, i) => (
            <div key={i} style={{ flex: s.pct, background: s.color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "60% STAKERS", color: "var(--orange)" },
            { label: "20% WORKERS", color: "var(--orange-2)" },
            { label: "10% BURN", color: "var(--orange-3)" },
            { label: "10% TREASURY", color: "var(--text-muted)" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ opacity: STAKING_ACTIONS_ENABLED ? 1 : 0.85 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 700,
              letterSpacing: "1px",
              marginBottom: 16,
            }}
          >
            STAKE $LOCK
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Amount</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0 $LOCK"
                  type="number"
                  min="0"
                  disabled={!STAKING_ACTIONS_ENABLED}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={!STAKING_ACTIONS_ENABLED || walletBalance == null}
                  onClick={() => setStakeAmount(String(walletBalance ?? 0))}
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    padding: "0 14px",
                    color: "var(--text-secondary)",
                    cursor: STAKING_ACTIONS_ENABLED ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  MAX
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                Wallet balance: {formatLock(walletBalance, balanceLoading)} $LOCK
              </div>
            </div>

            {STAKING_ACTIONS_ENABLED && stakeNum > 0 && (
              <div
                style={{
                  background: "var(--orange-dim)",
                  border: "1px solid var(--orange-border)",
                  borderRadius: 6,
                  padding: "12px",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                  Preview after staking {stakeNum.toLocaleString()} $LOCK
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Multiplier tier (planned)</span>
                  <span style={{ color: previewTier.color, fontWeight: 700 }}>
                    {previewTier.mult} {previewTier.label}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={!STAKING_ACTIONS_ENABLED || !connected || stakeNum <= 0}
            >
              {!connected
                ? "Connect Wallet to Stake"
                : STAKING_ACTIONS_ENABLED
                  ? "Stake $LOCK"
                  : "Stake — coming soon"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              {stakedLock && stakedLock > 0
                ? `Est. ~${((stakedLock * 0.08) / 365).toFixed(2)} $LOCK/day at ${PROTOCOL_APY} APY`
                : "Stake on-chain to earn from the staker pool."}
            </div>
          </div>
        </div>

        <div className="card" style={{ opacity: STAKING_ACTIONS_ENABLED ? 1 : 0.85 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 700,
              letterSpacing: "1px",
              marginBottom: 16,
            }}
          >
            UNSTAKE $LOCK
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Amount</div>
              <input
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="0 $LOCK"
                type="number"
                min="0"
                disabled={!STAKING_ACTIONS_ENABLED}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                Staked: {formatLock(stakedLock, false)} $LOCK
              </div>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "12px",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                7-day cooldown (planned)
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Unstake requests will enter a cooldown before $LOCK returns to your wallet. Matches the on-chain epoch
                reward schedule in FeeCollector.
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: "100%" }}
              disabled={!STAKING_ACTIONS_ENABLED || !connected}
            >
              {!connected
                ? "Connect Wallet to Unstake"
                : STAKING_ACTIONS_ENABLED
                  ? "Begin Unstake (7-day cooldown)"
                  : "Unstake — coming soon"}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontWeight: 700,
            letterSpacing: "1px",
            marginBottom: 8,
          }}
        >
          EARNINGS MULTIPLIER TIERS (PLANNED)
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Higher passive stake will boost your share of staker-pool rewards once multipliers are enabled on-chain.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {multiplierTiers.map((t) => (
            <div
              key={t.label}
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "16px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: t.color,
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}
              >
                {t.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: t.color }}>{t.mult}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                {t.min === 0 ? `0 – ${(t.max / 1000).toFixed(0)}K` : `${(t.min / 1000).toFixed(0)}K+`} $LOCK
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontWeight: 700,
                letterSpacing: "1px",
                marginBottom: 8,
              }}
            >
              WORKER SLA COLLATERAL (OPERATORS)
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
              This table is for GPU workers who serve inference — not passive stakers. Worker collateral is managed on
              the Worker dashboard when registration supports on-chain stake.
            </p>
          </div>
          <Link
            href="/worker"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--orange)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open Worker Dashboard →
          </Link>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              {["SLA Tier", "Min Collateral", "TTFT Target", "Penalty on Miss"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workerTierCollateral.map((row) => (
              <tr key={row.tier}>
                <td
                  style={{
                    fontWeight: 700,
                    color:
                      row.tier === "Realtime"
                        ? "var(--orange)"
                        : row.tier === "Confidential"
                          ? "var(--purple)"
                          : "var(--text-primary)",
                  }}
                >
                  {row.tier}
                </td>
                <td style={{ color: "var(--orange)", fontWeight: 700 }}>{row.collateral.toLocaleString()} $LOCK</td>
                <td style={{ color: "var(--text-secondary)" }}>{row.ttft}</td>
                <td style={{ color: "var(--red)", fontWeight: 600 }}>{row.penalty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
