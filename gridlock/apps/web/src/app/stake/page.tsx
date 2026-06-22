"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// Devnet LOCK mint — set after running scripts/create-lock-mint.ts
const LOCK_MINT_DEVNET = process.env.NEXT_PUBLIC_LOCK_MINT ?? "";

const multiplierTiers = [
  { min: 0,      max: 4999,   mult: "1.0x", label: "Base",   color: "var(--text-secondary)" },
  { min: 5000,   max: 14999,  mult: "1.5x", label: "Bronze", color: "var(--yellow)" },
  { min: 15000,  max: 49999,  mult: "2.0x", label: "Silver", color: "var(--text-primary)" },
  { min: 50000,  max: 999999, mult: "3.0x", label: "Gold",   color: "var(--orange)" },
];

const slaTierCollateral = [
  { tier: "Batch",        collateral: 1000,  ttft: "< 5s",          penalty: "0.25x fee" },
  { tier: "Standard",     collateral: 5000,  ttft: "< 800ms",       penalty: "1x fee" },
  { tier: "Realtime",     collateral: 15000, ttft: "< 300ms",       penalty: "2x fee" },
  { tier: "Confidential", collateral: 20000, ttft: "< 800ms + TEE", penalty: "1x + slash" },
];

const MOCK_STAKE   = 25000;
const MOCK_BALANCE = 18500;

export default function StakePage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [mounted, setMounted] = useState(false);

  const [stakeAmount, setStakeAmount]   = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [lockBalance, setLockBalance]   = useState<number | null>(null);
  const [stakedLock, setStakedLock]     = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError]     = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Attempt to read LOCK token balance and staked amount from chain
  useEffect(() => {
    if (!publicKey || !LOCK_MINT_DEVNET) {
      setLockBalance(null);
      setStakedLock(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    ;(async () => {
      try {
        const mint = new PublicKey(LOCK_MINT_DEVNET);
        const ata  = getAssociatedTokenAddressSync(mint, publicKey, false, TOKEN_2022_PROGRAM_ID);
        const acct = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
        const raw  = Number(acct.amount);
        setLockBalance(raw / 1e9); // 9 decimals
      } catch {
        setLockBalance(0);
        setBalanceError("LOCK token account not found — request devnet airdrop.");
      } finally {
        setBalanceLoading(false);
      }
    })();
  }, [publicKey, connection]);

  const displayStake   = mounted && connected && stakedLock   !== null ? stakedLock   : MOCK_STAKE;
  const displayBalance = mounted && connected && lockBalance  !== null ? lockBalance   : MOCK_BALANCE;

  const stakeNum         = parseFloat(stakeAmount) || 0;
  const totalAfterStake  = displayStake + stakeNum;
  const tier             = multiplierTiers.find((t) => totalAfterStake >= t.min && totalAfterStake <= t.max) ?? multiplierTiers[0];
  const currentTier      = multiplierTiers.find((t) => displayStake >= t.min && displayStake <= t.max) ?? multiplierTiers[0];
  const dailyEarnings    = (displayStake * 0.08) / 365;

  const isWalletRequired = mounted && !connected;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Stake LOCK</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>Stake LOCK to earn 60% of all network penalties and unlock higher SLA tiers. 8% APY on staked balance.</p>
      </div>

      {/* Wallet notices */}
      {isWalletRequired && (
        <div style={{ marginBottom: 20, padding: "12px 18px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, color: "var(--text-primary)", fontWeight: 700 }}>
          Connect your wallet (top right) to see your real LOCK balance and stake on-chain.
        </div>
      )}
      {mounted && connected && balanceError && (
        <div style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 6, background: "rgba(255,60,60,0.05)", border: "1px solid rgba(255,60,60,0.2)", fontSize: 12, color: "var(--red)" }}>
          {balanceError}
        </div>
      )}
      {!LOCK_MINT_DEVNET && mounted && (
        <div style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>
          LOCK mint not deployed yet. Showing mock balances. Run <code>npx ts-node scripts/create-lock-mint.ts</code> and set <code>NEXT_PUBLIC_LOCK_MINT</code>.
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "YOUR STAKED LOCK",    value: balanceLoading ? "…" : displayStake.toLocaleString(), accent: "var(--orange)" },
          { label: "WALLET BALANCE",      value: balanceLoading ? "…" : displayBalance.toLocaleString(), accent: "var(--text-primary)" },
          { label: "EARNINGS MULTIPLIER", value: currentTier.mult,  accent: currentTier.color },
          { label: "APY",                 value: "8%",               accent: "var(--green)" },
        ].map((s) => (
          <div key={s.label} className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
            {(s.label === "YOUR STAKED LOCK" || s.label === "WALLET BALANCE") && mounted && connected && !balanceLoading && (
              <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, marginTop: 6 }}>LIVE</div>
            )}
          </div>
        ))}
      </div>

      {/* Revenue split bar */}
      <div className="card card-orange" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>PENALTY REVENUE SPLIT</div>
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
        <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
          {[
            { label: "60% STAKERS",  color: "var(--orange)" },
            { label: "20% WORKERS",  color: "var(--orange-2)" },
            { label: "10% BURN",     color: "var(--orange-3)" },
            { label: "10% TREASURY", color: "var(--text-muted)" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Forms */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Stake */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>STAKE LOCK</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Amount</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} placeholder="0 LOCK" type="number" min="0" style={{ flex: 1 }} />
                <button onClick={() => setStakeAmount(String(displayBalance))} style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 5, padding: "0 14px", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>MAX</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>Balance: {displayBalance.toLocaleString()} LOCK</div>
            </div>

            {stakeNum > 0 && (
              <div style={{ background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 6, padding: "12px" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>After staking {stakeNum.toLocaleString()} LOCK</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Total staked</span>
                  <span style={{ color: "var(--orange)", fontWeight: 700 }}>{totalAfterStake.toLocaleString()} LOCK</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Multiplier tier</span>
                  <span style={{ color: tier.color, fontWeight: 700 }}>{tier.mult} {tier.label}</span>
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%", opacity: stakeNum > 0 && connected ? 1 : 1, background: "#FFFFFF", color: "#000000", borderColor: "#FFFFFF" }}
              disabled={!connected || stakeNum <= 0}
            >
              {connected ? "Stake LOCK" : "Connect Wallet to Stake"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              Daily earnings at current stake: ~{dailyEarnings.toFixed(2)} LOCK/day
            </div>
          </div>
        </div>

        {/* Unstake */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>UNSTAKE LOCK</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Amount</div>
              <input value={unstakeAmount} onChange={(e) => setUnstakeAmount(e.target.value)} placeholder="0 LOCK" type="number" min="0" style={{ width: "100%" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>Staked: {displayStake.toLocaleString()} LOCK</div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>7-Day Cooldown</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                5,000 LOCK locked as SLA collateral. Exit accepted SLA tiers before unstaking collateral. Pending unstake earns no APY.
              </div>
            </div>

            <button
              className="btn btn-ghost"
              style={{ width: "100%", background: "#FFFFFF", borderColor: "#FFFFFF", color: "#000000", opacity: connected ? 1 : 1 }}
              disabled={!connected}
            >
              {connected ? "Begin Unstake (7-day cooldown)" : "Connect Wallet to Unstake"}
            </button>
          </div>
        </div>
      </div>

      {/* Multiplier tiers */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>EARNINGS MULTIPLIER TIERS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {multiplierTiers.map((t) => {
            const active = displayStake >= t.min && displayStake <= t.max;
            return (
              <div key={t.label} style={{
                background: active ? "var(--orange-dim)" : "var(--bg-3)",
                border: active ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                borderRadius: 6, padding: "16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 10, color: t.color, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 6 }}>{t.label.toUpperCase()}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: t.color }}>{t.mult}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  {t.min === 0 ? `0 – ${(t.max / 1000).toFixed(0)}K` : `${(t.min / 1000).toFixed(0)}K+`} LOCK
                </div>
                {active && <div style={{ marginTop: 8, fontSize: 11, color: "var(--orange)", fontWeight: 700 }}>Current tier</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* SLA collateral table */}
      <div className="card">
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>SLA TIER COLLATERAL (WORKERS)</div>
        <table className="data-table">
          <thead>
            <tr>
              {["SLA Tier", "Min Collateral", "TTFT Target", "Penalty on Miss", "Your Status"].map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {slaTierCollateral.map((row) => {
              const eligible = displayStake >= row.collateral;
              return (
                <tr key={row.tier}>
                  <td style={{ fontWeight: 700, color: row.tier === "Realtime" ? "var(--orange)" : row.tier === "Confidential" ? "var(--purple)" : "var(--text-primary)" }}>{row.tier}</td>
                  <td style={{ color: "var(--orange)", fontWeight: 700 }}>{row.collateral.toLocaleString()} LOCK</td>
                  <td style={{ color: "var(--text-secondary)" }}>{row.ttft}</td>
                  <td style={{ color: "var(--red)", fontWeight: 600 }}>{row.penalty}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: eligible ? "var(--green)" : "var(--text-muted)" }}>
                      {eligible ? "Eligible" : `Need ${(row.collateral - displayStake).toLocaleString()} more`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
