"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  fetchBillingSummary,
  fetchModelPricing,
  type ApiModelPricing,
  type BillingSummary,
} from "@/lib/api-client";
import { INSECURE_KEY_MANAGEMENT, signGridlockKeysAction } from "@/lib/wallet-auth";

const TIER_ORDER = ["batch", "standard", "realtime", "confidential"] as const;

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
  const { publicKey, connected, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [models, setModels] = useState<ApiModelPricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const auth = await signAuth("summary");
      const [billing, pricing] = await Promise.all([
        fetchBillingSummary(auth),
        fetchModelPricing(),
      ]);
      setSummary(billing);
      setModels(pricing.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, [wallet, signAuth]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading && !summary) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
        Loading billing…
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const s = summary!;
  const empty = s.mtd_requests === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {s.period.label} · live usage from your API requests
        </div>
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: 11, padding: "4px 10px" }}
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
            value: s.credit_balance_lock != null ? `${s.credit_balance_lock.toFixed(2)} $LOCK` : "—",
            accent: "var(--green)",
            hint: s.credit_balance_lock == null ? "Phase B — prepaid credits" : undefined,
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
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
          Monthly on-chain invoices are not enabled yet (Phase C). Current-month usage above is live from job records.
        </div>
      </div>
    </div>
  );
}
