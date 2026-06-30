"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  confirmStakeDeposit,
  confirmStakeUnstakeClaim,
  fetchStakeDepositInfo,
  fetchStakeInfo,
  fetchStakePosition,
  fetchStakeUnstakeClaimTx,
  requestStakeUnstake,
  type StakeDepositInfo,
  type StakeInfo,
  type StakePosition,
} from "@/lib/api-client";
import { sendClaimUnstakeTransaction, sendLockStake } from "@/lib/lock-stake";
import { INSECURE_KEY_MANAGEMENT, signGridlockKeysAction } from "@/lib/wallet-auth";

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

function formatLock(amount: number | null | undefined, loading = false): string {
  if (loading) return "…";
  if (amount == null) return "—";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function tierColor(label: string): string {
  return multiplierTiers.find((t) => t.label === label)?.color ?? "var(--text-muted)";
}

export default function StakePage() {
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const [mounted, setMounted] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [lockBalance, setLockBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [poolInfo, setPoolInfo] = useState<StakeInfo | null>(null);
  const [position, setPosition] = useState<StakePosition | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [positionLoading, setPositionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [depositInfo, setDepositInfo] = useState<StakeDepositInfo | null>(null);
  const [stakeBusy, setStakeBusy] = useState(false);
  const [stakeMsg, setStakeMsg] = useState<string | null>(null);
  const [unstakeBusy, setUnstakeBusy] = useState(false);
  const [unstakeMsg, setUnstakeMsg] = useState<string | null>(null);

  const stakingEnabled = poolInfo?.staking_deposit_enabled ?? false;
  const claimEnabled = poolInfo?.staking_claim_enabled ?? false;
  const minStake = poolInfo?.min_stake_lock ?? 1;
  const cooldownDays = poolInfo?.unstake_cooldown_days ?? 7;
  const lockMint = poolInfo?.lock_mint ?? depositInfo?.lock_mint ?? "";

  const signAuth = useCallback(
    async (action: string) => {
      if (!wallet) throw new Error("Connect your wallet first");
      if (INSECURE_KEY_MANAGEMENT) return { wallet, timestampMs: Date.now(), signatureBase64: "" };
      if (!signMessage) throw new Error("Your wallet does not support message signing");
      return signGridlockKeysAction(signMessage, wallet, action);
    },
    [wallet, signMessage],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadPoolInfo = useCallback(async () => {
    try {
      const info = await fetchStakeInfo();
      setPoolInfo(info);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load staking info");
    } finally {
      setInfoLoading(false);
    }
  }, []);

  const loadPosition = useCallback(async () => {
    if (!wallet) {
      setPosition(null);
      setDepositInfo(null);
      return;
    }
    setPositionLoading(true);
    setLoadError(null);
    try {
      const [pos, dep] = await Promise.all([
        fetchStakePosition(wallet),
        fetchStakeDepositInfo(wallet).catch(() => null),
      ]);
      setPosition(pos);
      setDepositInfo(dep);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load staking position");
      setPosition(null);
      setDepositInfo(null);
    } finally {
      setPositionLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void loadPoolInfo();
    const id = setInterval(() => void loadPoolInfo(), 30_000);
    return () => clearInterval(id);
  }, [loadPoolInfo]);

  useEffect(() => {
    void loadPosition();
  }, [loadPosition]);

  useEffect(() => {
    if (!publicKey || !lockMint) {
      setLockBalance(null);
      setBalanceError(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    void (async () => {
      try {
        const mint = new PublicKey(lockMint);
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
  }, [publicKey, connection, lockMint]);

  const stakedLock = position?.staked_lock ?? null;
  const pendingUnstake = position?.pending_unstake ?? null;
  const availableToUnstake = Math.max(0, (stakedLock ?? 0) - (position?.pending_unstake_lock ?? 0));
  const walletBalance = connected ? lockBalance : null;
  const stakeNum = parseFloat(stakeAmount) || 0;
  const previewStakeTotal = (stakedLock ?? 0) + stakeNum;
  const previewTier =
    multiplierTiers.find((t) => previewStakeTotal >= t.min && previewStakeTotal <= t.max) ?? multiplierTiers[0];
  const currentTier = position?.multiplier_tier;
  const targetApy = poolInfo ? `${poolInfo.target_apy_pct}%` : "—";
  const dailyApy = position?.estimated_daily_apy_lock ?? 0;

  const isWalletRequired = mounted && !connected;
  const walletBalanceLive = mounted && connected && !balanceLoading && lockBalance !== null && !balanceError;
  const stakedLive = mounted && connected && !positionLoading && position != null;

  async function handleStake() {
    if (!publicKey || !depositInfo || !sendTransaction) {
      setStakeMsg("Connect a wallet that supports transactions.");
      return;
    }
    if (stakeNum < minStake) {
      setStakeMsg(`Minimum stake is ${minStake} $LOCK`);
      return;
    }
    setStakeBusy(true);
    setStakeMsg(null);
    try {
      const sig = await sendLockStake({
        connection,
        publicKey,
        sendTransaction,
        lockMint: depositInfo.lock_mint,
        stakerVaultAta: depositInfo.staker_vault_ata,
        stakerVaultAuthority: depositInfo.staker_vault_authority,
        amountLock: stakeNum,
        decimals: depositInfo.decimals,
      });
      const auth = await signAuth("stake");
      const res = await confirmStakeDeposit(auth, sig);
      setStakeMsg(
        `Staked ${res.staked_lock.toFixed(4)} $LOCK · total ${res.total_staked_lock.toFixed(4)} $LOCK`,
      );
      setStakeAmount("");
      await loadPosition();
      setLockBalance((b) => (b != null ? Math.max(0, b - stakeNum) : b));
    } catch (e) {
      setStakeMsg(e instanceof Error ? e.message : "Stake failed");
    } finally {
      setStakeBusy(false);
    }
  }

  async function handleUnstakeRequest() {
    const unstakeNum = parseFloat(unstakeAmount) || 0;
    if (unstakeNum < minStake) {
      setUnstakeMsg(`Minimum unstake is ${minStake} $LOCK`);
      return;
    }
    if (unstakeNum > availableToUnstake + 0.0001) {
      setUnstakeMsg(`Only ${availableToUnstake.toFixed(4)} $LOCK available to unstake`);
      return;
    }
    setUnstakeBusy(true);
    setUnstakeMsg(null);
    try {
      const auth = await signAuth("stake");
      const res = await requestStakeUnstake(auth, unstakeNum);
      setUnstakeMsg(
        `Unstake of ${unstakeNum.toFixed(4)} $LOCK requested · unlocks ${new Date(res.unlock_at).toLocaleString()}`,
      );
      setUnstakeAmount("");
      await loadPosition();
    } catch (e) {
      setUnstakeMsg(e instanceof Error ? e.message : "Unstake request failed");
    } finally {
      setUnstakeBusy(false);
    }
  }

  async function handleClaimUnstake() {
    if (!sendTransaction) {
      setUnstakeMsg("Connect a wallet that supports transactions.");
      return;
    }
    setUnstakeBusy(true);
    setUnstakeMsg(null);
    try {
      const auth = await signAuth("stake");
      const { transaction_base64, amount_lock } = await fetchStakeUnstakeClaimTx(auth);
      const sig = await sendClaimUnstakeTransaction({
        connection,
        sendTransaction,
        transactionBase64: transaction_base64,
      });
      const res = await confirmStakeUnstakeClaim(auth, sig);
      setUnstakeMsg(`Claimed ${amount_lock.toFixed(4)} $LOCK · staked ${res.staked_lock.toFixed(4)} $LOCK`);
      await loadPosition();
    } catch (e) {
      setUnstakeMsg(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setUnstakeBusy(false);
    }
  }

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
          Passive staking earns a share of network fees ({poolInfo?.revenue_split.stakers_pct ?? 60}% staker pool) at a
          target {targetApy} APY. Deposits go to your on-chain staker vault; unstake has a {cooldownDays}-day cooldown.
        </p>
      </div>

      {loadError && (
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
          {loadError}
        </div>
      )}

      {!stakingEnabled && mounted && !infoLoading && (
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
          <strong style={{ color: "var(--orange)" }}>Staking deposits are disabled.</strong> Set{" "}
          <code>LOCK_MINT</code> and <code>GRIDLOCK_STAKING_ENABLED=true</code> on the backend.
        </div>
      )}

      {stakeMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 6,
            background: stakeMsg.includes("failed") || stakeMsg.includes("Minimum")
              ? "rgba(255,60,60,0.05)"
              : "rgba(0,200,100,0.05)",
            border: `1px solid ${stakeMsg.includes("failed") || stakeMsg.includes("Minimum") ? "rgba(255,60,60,0.2)" : "rgba(0,200,100,0.2)"}`,
            fontSize: 12,
            color: stakeMsg.includes("failed") || stakeMsg.includes("Minimum") ? "var(--red)" : "var(--green)",
          }}
        >
          {stakeMsg}
        </div>
      )}

      {unstakeMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 6,
            background: unstakeMsg.includes("failed") || unstakeMsg.includes("Minimum") || unstakeMsg.includes("Only")
              ? "rgba(255,60,60,0.05)"
              : "rgba(0,200,100,0.05)",
            border: `1px solid ${unstakeMsg.includes("failed") || unstakeMsg.includes("Minimum") || unstakeMsg.includes("Only") ? "rgba(255,60,60,0.2)" : "rgba(0,200,100,0.2)"}`,
            fontSize: 12,
            color:
              unstakeMsg.includes("failed") || unstakeMsg.includes("Minimum") || unstakeMsg.includes("Only")
                ? "var(--red)"
                : "var(--green)",
          }}
        >
          {unstakeMsg}
        </div>
      )}

      {pendingUnstake && (
        <div
          className="card"
          style={{ marginBottom: 20, borderColor: "rgba(255,160,0,0.25)", padding: "14px 18px" }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Pending unstake: {pendingUnstake.amount_lock.toLocaleString()} $LOCK
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
            {pendingUnstake.claimable
              ? "Cooldown complete — you can claim your $LOCK back to your wallet."
              : `Unlocks ${new Date(pendingUnstake.unlock_at).toLocaleString()} (${cooldownDays}-day cooldown)`}
            {!claimEnabled && pendingUnstake.claimable && (
              <> · On-chain claim requires FeeCollector program redeploy.</>
            )}
          </div>
          {pendingUnstake.claimable && claimEnabled && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={unstakeBusy || !connected}
              onClick={() => void handleClaimUnstake()}
            >
              {unstakeBusy ? "Claiming…" : "Claim $LOCK"}
            </button>
          )}
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
          Connect your wallet to see your staked balance and wallet $LOCK.
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

      {!lockMint && mounted && !infoLoading && (
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
          Wallet balance unavailable — backend has no <code>LOCK_MINT</code> configured.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "YOUR STAKED $LOCK",
            value: formatLock(stakedLock, positionLoading),
            accent: "var(--orange)",
            badge: stakedLive ? (stakedLock && stakedLock > 0 ? "LIVE" : "NOT STAKED") : null,
            badgeColor: stakedLock && stakedLock > 0 ? "var(--green)" : "var(--text-muted)",
          },
          {
            label: "WALLET BALANCE",
            value: formatLock(walletBalance, balanceLoading),
            accent: "var(--text-primary)",
            badge: walletBalanceLive ? "LIVE" : null,
            badgeColor: "var(--green)",
          },
          {
            label: "EARNINGS MULTIPLIER",
            value: currentTier ? `${currentTier.mult}x` : stakedLive ? "1.0x" : "—",
            accent: currentTier ? tierColor(currentTier.label) : "var(--text-muted)",
            badge: currentTier && stakedLock && stakedLock > 0 ? currentTier.label.toUpperCase() : "PLANNED",
            badgeColor: "var(--text-muted)",
          },
          {
            label: "TARGET APY",
            value: infoLoading ? "…" : targetApy,
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "STAKER POOL (TVL)",
            value: formatLock(poolInfo?.staker_pool_lock, infoLoading),
            sub: poolInfo?.staker_pool_exists ? "On-chain vault" : "Vault not found",
          },
          {
            label: "PENALTIES (MTD)",
            value: formatLock(poolInfo?.total_penalties_lock, infoLoading),
            sub: "From job records",
          },
          {
            label: "LOCK BURNED",
            value: formatLock(poolInfo?.lock_burned, infoLoading),
            sub: "Settlement + fee split",
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
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--orange)" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {position?.worker.registered && (
        <div
          className="card"
          style={{ marginBottom: 24, borderColor: "rgba(255,255,255,0.12)", padding: "14px 18px" }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            You are registered as a worker ({position.worker.role}, {position.worker.status})
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Worker collateral: {formatLock(position.worker.staked_lock)} $LOCK · SLA pass{" "}
            {position.worker.sla_pass_rate?.toFixed(1)}%. Worker stake is separate from passive staker pool deposits.
          </div>
        </div>
      )}

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
          FEE REVENUE SPLIT (PROTOCOL · {poolInfo?.revenue_split.stakers_pct ?? 60}/{poolInfo?.revenue_split.workers_pct ?? 20}/
          {poolInfo?.revenue_split.burn_pct ?? 10}/{poolInfo?.revenue_split.treasury_pct ?? 10})
        </div>
        <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", height: 6 }}>
          {[
            { pct: poolInfo?.revenue_split.stakers_pct ?? 60, color: "var(--orange)" },
            { pct: poolInfo?.revenue_split.workers_pct ?? 20, color: "var(--orange-2)" },
            { pct: poolInfo?.revenue_split.burn_pct ?? 10, color: "var(--orange-3)" },
            { pct: poolInfo?.revenue_split.treasury_pct ?? 10, color: "var(--bg-4)" },
          ].map((s, i) => (
            <div key={i} style={{ flex: s.pct, background: s.color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: `${poolInfo?.revenue_split.stakers_pct ?? 60}% STAKERS`, color: "var(--orange)" },
            { label: `${poolInfo?.revenue_split.workers_pct ?? 20}% WORKERS`, color: "var(--orange-2)" },
            { label: `${poolInfo?.revenue_split.burn_pct ?? 10}% BURN`, color: "var(--orange-3)" },
            { label: `${poolInfo?.revenue_split.treasury_pct ?? 10}% TREASURY`, color: "var(--text-muted)" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ opacity: stakingEnabled ? 1 : 0.85 }}>
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
                  disabled={!stakingEnabled}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={!stakingEnabled || walletBalance == null}
                  onClick={() => setStakeAmount(String(walletBalance ?? 0))}
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    padding: "0 14px",
                    color: "var(--text-secondary)",
                    cursor: stakingEnabled ? "pointer" : "not-allowed",
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

            {stakingEnabled && stakeNum > 0 && (
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
              disabled={!stakingEnabled || !connected || stakeNum <= 0 || stakeBusy}
              onClick={() => void handleStake()}
            >
              {!connected
                ? "Connect Wallet to Stake"
                : stakeBusy
                  ? "Staking…"
                  : stakingEnabled
                    ? "Stake $LOCK"
                    : "Stake — disabled"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              {stakedLock && stakedLock > 0
                ? `Est. ~${dailyApy.toFixed(4)} $LOCK/day at ${targetApy} APY`
                : "Stake on-chain to earn from the staker pool."}
            </div>
          </div>
        </div>

        <div className="card" style={{ opacity: stakingEnabled ? 1 : 0.85 }}>
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
                disabled={!stakingEnabled}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                Staked: {formatLock(stakedLock, positionLoading)} $LOCK · Available:{" "}
                {formatLock(availableToUnstake, positionLoading)} $LOCK
                {position?.pending_unstake_lock ? ` · Pending: ${position.pending_unstake_lock} $LOCK` : ""}
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
                {cooldownDays}-day cooldown
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Request unstake to start the cooldown. After it ends, claim returns $LOCK from your staker vault to your
                wallet (requires FeeCollector program upgrade for on-chain claim).
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: "100%" }}
              disabled={
                !stakingEnabled || !connected || unstakeBusy || Boolean(pendingUnstake) || (parseFloat(unstakeAmount) || 0) <= 0
              }
              onClick={() => void handleUnstakeRequest()}
            >
              {!connected
                ? "Connect Wallet to Unstake"
                : unstakeBusy
                  ? "Processing…"
                  : pendingUnstake
                    ? "Unstake pending"
                    : stakingEnabled
                      ? `Begin Unstake (${cooldownDays}-day cooldown)`
                      : "Unstake — disabled"}
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
          EARNINGS MULTIPLIER TIERS
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Higher passive stake will boost your share of staker-pool rewards once multipliers are enabled on-chain.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {multiplierTiers.map((t) => {
            const active = currentTier?.label === t.label && (stakedLock ?? 0) > 0;
            return (
              <div
                key={t.label}
                style={{
                  background: active ? "var(--orange-dim)" : "var(--bg-3)",
                  border: active ? "1px solid var(--orange-border)" : "1px solid var(--border)",
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
                {active && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--orange)", fontWeight: 700 }}>
                    Current tier
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
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
              For GPU workers who serve inference — not passive stakers. Manage worker registration on the Worker
              dashboard.
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
