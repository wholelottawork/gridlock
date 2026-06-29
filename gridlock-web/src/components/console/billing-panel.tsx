"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  confirmBillingDeposit,
  fetchBillingDepositInfoWithSession,
  fetchBillingInvoicesWithSession,
  fetchBillingSummaryWithSession,
  fetchBillingTopup,
  fetchModelPricing,
  type ApiModelPricing,
  type BillingDepositInfo,
  type BillingInvoice,
  type BillingSummary,
} from "@/lib/api-client";
import { sendLockDeposit } from "@/lib/lock-deposit";
import { useWalletSession } from "@/context/wallet-session-context";
import { INSECURE_KEY_MANAGEMENT, signGridlockKeysAction } from "@/lib/wallet-auth";
import { clearWalletSession, isSessionAuthError } from "@/lib/wallet-session";

const TIER_ORDER = ["batch", "standard", "realtime", "confidential"] as const;
const DEV_TOPUP_ENABLED =
  process.env.NEXT_PUBLIC_GRIDLOCK_BILLING_DEV_TOPUP === "true" || INSECURE_KEY_MANAGEMENT;
const LOW_BALANCE_THRESHOLD = 0.5;

function invoiceStatusLabel(status: BillingInvoice["status"]): string {
  if (status === "open") return "OPEN";
  if (status === "paid") return "PAID";
  return "OFF-CHAIN";
}

function invoiceStatusColor(status: BillingInvoice["status"]): string {
  if (status === "open") return "var(--orange)";
  if (status === "paid") return "var(--green)";
  return "var(--text-muted)";
}

function shortTx(sig: string): string {
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function tierPrice(model: ApiModelPricing, tier: string): string {
  const mult = model.tier_multipliers[tier] ?? 1;
  return (model.base_fee_lock_per_1m * mult).toFixed(1);
}

export function BillingPanel() {
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();
  const { ensureSession } = useWalletSession();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [models, setModels] = useState<ApiModelPricing[]>([]);
  const [depositInfo, setDepositInfo] = useState<BillingDepositInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState<string | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);

  const signAuth = useCallback(
    async (action: string) => {
      if (!wallet) throw new Error("Connect your wallet first");
      if (INSECURE_KEY_MANAGEMENT) return { wallet, timestampMs: Date.now(), signatureBase64: "" };
      if (!signMessage) throw new Error("Your wallet does not support message signing");
      return signGridlockKeysAction(signMessage, wallet, action);
    },
    [wallet, signMessage],
  );

  const load = useCallback(async () => {
    if (!wallet) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let token = await ensureSession();
      const fetchReads = async (sessionToken: string) =>
        Promise.all([
          fetchBillingSummaryWithSession(wallet, sessionToken),
          fetchBillingInvoicesWithSession(wallet, sessionToken),
          fetchModelPricing().catch(() => ({ models: [], total: 0 })),
          fetchBillingDepositInfoWithSession(wallet, sessionToken).catch(() => null),
        ]);

      let billing: BillingSummary;
      let invoiceRes: Awaited<ReturnType<typeof fetchBillingInvoicesWithSession>>;
      let pricing: Awaited<ReturnType<typeof fetchModelPricing>>;
      let deposit: BillingDepositInfo | null;
      try {
        [billing, invoiceRes, pricing, deposit] = await fetchReads(token);
      } catch (e) {
        if (isSessionAuthError(e)) {
          clearWalletSession();
          token = await ensureSession();
          [billing, invoiceRes, pricing, deposit] = await fetchReads(token);
        } else {
          throw e;
        }
      }
      setSummary(billing);
      setInvoices(invoiceRes.invoices);
      setModels(pricing.models);
      setDepositInfo(deposit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, [wallet, ensureSession]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTopup(amount: number) {
    setTopupBusy(true);
    setTopupMsg(null);
    try {
      const auth = await signAuth("topup");
      const res = await fetchBillingTopup(auth, amount);
      setTopupMsg(`+${res.credited.toFixed(2)} $LOCK added · balance ${res.balance_lock.toFixed(2)} $LOCK`);
      await load();
    } catch (e) {
      setTopupMsg(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setTopupBusy(false);
    }
  }

  async function handleDeposit(amount: number) {
    if (!publicKey || !depositInfo || !sendTransaction) {
      setDepositMsg("Connect a wallet that supports transactions.");
      return;
    }
    setDepositBusy(true);
    setDepositMsg(null);
    try {
      const sig = await sendLockDeposit({
        connection,
        publicKey,
        sendTransaction,
        lockMint: depositInfo.lock_mint,
        depositVault: depositInfo.deposit_vault,
        amountLock: amount,
        decimals: depositInfo.decimals,
      });
      const auth = await signAuth("deposit");
      const res = await confirmBillingDeposit(auth, sig);
      setDepositMsg(
        `Deposited ${res.credited.toFixed(2)} $LOCK · balance ${res.balance_lock.toFixed(2)} $LOCK`,
      );
      await load();
    } catch (e) {
      setDepositMsg(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setDepositBusy(false);
    }
  }

  if (!connected || !wallet) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Connect wallet to view billing</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Usage is tracked per wallet — the same wallet that owns your API keys.
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
        Loading billing…
      </div>
    );
  }

  const s = summary;
  const empty = s.mtd_requests === 0;
  const balance = s.credit_balance_lock;
  const lowBalance = balance != null && balance < LOW_BALANCE_THRESHOLD;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {s.period.label} · live usage from your API requests
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px" }}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "MTD SPEND", value: `${s.mtd_spend_lock.toFixed(2)} $LOCK`, accent: "var(--orange)" },
          {
            label: "CREDIT BALANCE",
            value: balance != null ? `${balance.toFixed(2)} $LOCK` : "—",
            accent: lowBalance ? "var(--red)" : "var(--green)",
            hint:
              balance != null
                ? lowBalance
                  ? "Low balance — requests may be blocked"
                  : "Deducted per inference request"
                : undefined,
          },
          { label: "REQUESTS (MTD)", value: s.mtd_requests.toLocaleString(), accent: "var(--text-primary)" },
          { label: "TOKENS (MTD)", value: formatTokens(s.mtd_tokens), accent: "var(--text-secondary)" },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: stat.accent }}>{stat.value}</div>
            {"hint" in stat && stat.hint && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>{stat.hint}</div>
            )}
          </div>
        ))}
      </div>

      {lowBalance && (
        <div className="card" style={{ borderColor: "var(--red)", padding: "12px 16px" }}>
          <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>
            Insufficient credits will return HTTP 402 on API requests. Each standard request costs ~0.05 $LOCK.
          </span>
        </div>
      )}

      {depositInfo && (
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>
            DEPOSIT $LOCK (ON-CHAIN → CREDITS)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Send $LOCK to the treasury vault — credits apply automatically after confirmation.
            Min {depositInfo.min_deposit_lock} $LOCK.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[5, 10, 25].map((amt) => (
              <button
                key={amt}
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 13, padding: "8px 18px", opacity: depositBusy ? 0.6 : 1 }}
                disabled={depositBusy || amt < depositInfo.min_deposit_lock}
                onClick={() => void handleDeposit(amt)}
              >
                Deposit {amt} $LOCK
              </button>
            ))}
          </div>
          {depositMsg && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{depositMsg}</div>
          )}
        </div>
      )}

      {DEV_TOPUP_ENABLED && (
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>
            ADD TEST CREDITS (DEV)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[10, 25, 50].map((amt) => (
              <button
                key={amt}
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 13, padding: "8px 18px", opacity: topupBusy ? 0.6 : 1 }}
                disabled={topupBusy}
                onClick={() => void handleTopup(amt)}
              >
                +{amt} $LOCK
              </button>
            ))}
          </div>
          {topupMsg && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{topupMsg}</div>
          )}
        </div>
      )}

      {s.penalties_credited_lock > 0 && (
        <div className="card" style={{ borderColor: "var(--green)", padding: "12px 16px" }}>
          <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>
            +{s.penalties_credited_lock.toFixed(4)} $LOCK SLA penalties credited this month
          </span>
        </div>
      )}

      {empty ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>No usage yet this month</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Send requests from the Playground or with your API key — spend will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
              SPEND BY SLA TIER
            </div>
            {s.by_tier.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No tier data</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {s.by_tier.map((t) => (
                  <div key={t.tier_id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.tier}</span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {t.spend.toFixed(2)} $LOCK · {t.requests.toLocaleString()} req
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${t.pct}%`, background: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
              SPEND BY MODEL
            </div>
            {s.by_model.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No model data</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {s.by_model.map((m) => (
                  <div key={m.model}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                        {m.model.split("-").slice(0, 3).join("-")}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>
                        {m.spend.toFixed(2)} $LOCK
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${m.pct}%`, background: "var(--orange)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {s.by_api_key.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
            SPEND BY API KEY
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {["Key", "Prefix", "Requests", "Spend"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.by_api_key.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{k.key_prefix}</td>
                  <td>{k.requests.toLocaleString()}</td>
                  <td style={{ color: "var(--orange)", fontWeight: 700 }}>{k.spend.toFixed(4)} $LOCK</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
          PRICING ($LOCK per 1M tokens)
        </div>
        <table className="data-table">
          <thead>
            <tr>
              {["Model", "Batch", "Standard", "Realtime", "Confidential"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id}>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{model.id}</td>
                {TIER_ORDER.map((tier) => (
                  <td key={tier} style={{ color: "var(--orange)", fontWeight: 700 }}>
                    {tierPrice(model, tier)} $LOCK
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
          INVOICE HISTORY
        </div>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
            No invoices yet — usage this month will appear as an open invoice.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {["Period", "Amount", "Requests", "Status", "On-Chain Tx"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={`${inv.period_year}-${inv.period_month}`}>
                  <td style={{ fontWeight: 600 }}>{inv.period_label}</td>
                  <td style={{ color: "var(--orange)", fontWeight: 700 }}>{inv.amount_lock.toFixed(2)} $LOCK</td>
                  <td>{inv.request_count.toLocaleString()}</td>
                  <td>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: invoiceStatusColor(inv.status),
                      }}
                    >
                      {invoiceStatusLabel(inv.status)}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                    {inv.explorer_url && inv.settlement_tx ? (
                      <a
                        href={inv.explorer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--orange)", textDecoration: "none" }}
                      >
                        {shortTx(inv.settlement_tx)}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
          Closed months are settled from job records. On-chain tx links appear when Solana settlement succeeds per job.
        </div>
      </div>
    </div>
  );
}
