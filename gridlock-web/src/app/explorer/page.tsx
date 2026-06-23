"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  fetchNetworkStats,
  fetchWorkers,
  fetchJobs,
  fetchCacheStats,
  fetchPdStats,
  type ApiWorker,
  type ApiJob,
  type ApiNetworkStats,
  type ApiCacheStats,
  type ApiPdStats,
} from "@/lib/api-client";
import { fmt } from "@/lib/utils";

const EMPTY_STATS: ApiNetworkStats = {
  active_workers: 0,
  idle_workers: 0,
  tee_workers: 0,
  jobs_total: 0,
  jobs_1h: 0,
  sla_pass_rate: 0,
  p99_ttft_ms: 0,
  total_penalties_lock: 0,
  confidential_share: 0,
  lock_burned: 0,
  total_workers: 0,
  requests_today: 0,
  cache_hit_entries: 0,
};

type ExplorerTab = "network" | "workers" | "receipts";

function jobTimestamp(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function ScoreBar({ score, max = 10000, color = "var(--orange)" }: { score: number; max?: number; color?: string }) {
  const pct = (score / max) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="progress-track" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, width: 40, textAlign: "right" }}>{fmt(score, 0)}</span>
    </div>
  );
}

export default function ExplorerPage() {
  const [tab, setTab] = useState<ExplorerTab>("network");
  const [workers, setWorkers] = useState<ApiWorker[]>([]);
  const [stats, setStats] = useState<ApiNetworkStats>(EMPTY_STATS);
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<ApiWorker | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [cacheStats, setCacheStats] = useState<ApiCacheStats | null>(null);
  const [pdStats, setPdStats] = useState<ApiPdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refreshAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [workersRes, jobsRes, networkStats, cache, pd] = await Promise.all([
        fetchWorkers({ limit: 100 }),
        fetchJobs({ limit: 40 }),
        fetchNetworkStats(),
        fetchCacheStats().catch(() => null),
        fetchPdStats().catch(() => null),
      ]);

      setWorkers(workersRes.workers);
      setJobs(jobsRes.jobs);
      setStats(networkStats);
      setCacheStats(cache);
      setPdStats(pd);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load explorer data");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll(true);
    const id = setInterval(() => void refreshAll(false), 3000);
    return () => clearInterval(id);
  }, [refreshAll]);

  const filtered = workers.filter(
    (w) => w.address.toLowerCase().includes(search.toLowerCase())
      || w.role.toLowerCase().includes(search.toLowerCase())
      || w.hardware_tier.toLowerCase().includes(search.toLowerCase()),
  );

  const sortedByGoodput = [...workers].sort((a, b) => b.goodput_score - a.goodput_score).slice(0, 10);
  const sortedByReliability = [...workers].sort((a, b) => b.reliability_score - a.reliability_score).slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Explorer</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
          Public network and worker history from the Gridlock API.
          {lastUpdated && (
            <span style={{ marginLeft: 8, color: "var(--green)", fontSize: 11 }}>LIVE · updated every 3s</span>
          )}
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, background: "rgba(255,68,68,0.06)", border: "1px solid rgba(255,68,68,0.25)", fontSize: 12, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
          Loading network data…
        </div>
      )}

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {([["network", "Network Health"], ["workers", "Workers"], ["receipts", "Job Receipts"]] as [ExplorerTab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn${tab === t ? " active" : ""}`}>{l}</button>
        ))}
      </div>

      {tab === "network" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "SLA PASS RATE", value: `${stats.sla_pass_rate.toFixed(1)}%`, accent: "var(--green)" },
              { label: "P99 TTFT", value: stats.p99_ttft_ms > 0 ? `${stats.p99_ttft_ms}ms` : "—", accent: "var(--text-primary)" },
              { label: "ACTIVE WORKERS", value: stats.active_workers.toString(), accent: "var(--text-primary)" },
              { label: "TOTAL PENALTIES", value: `${fmt(stats.total_penalties_lock, 4)} $LOCK`, accent: "var(--orange)" },
            ].map((s) => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {cacheStats && (
              <div className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>KV-CACHE STATS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "HIT RATE", value: `${(cacheStats.hit_rate * 100).toFixed(1)}%`, color: cacheStats.hit_rate > 0.5 ? "var(--green)" : "var(--yellow)" },
                    { label: "HITS", value: fmt(cacheStats.hits, 0), color: "var(--text-primary)" },
                    { label: "MISSES", value: fmt(cacheStats.misses, 0), color: "var(--text-secondary)" },
                  ].map((s) => (
                    <div key={s.label} style={{ background: "var(--bg-3)", borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${cacheStats.hit_rate * 100}%`, background: "var(--green)" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  {fmt(cacheStats.entries, 0)} entries cached · strategy: {cacheStats.strategy}
                </div>
              </div>
            )}

            {pdStats && (
              <div className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>PREFILL / DECODE POOL</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "PREFILL", value: pdStats.prefill_workers, color: "var(--green)" },
                    { label: "DECODE", value: pdStats.decode_workers, color: "var(--orange)" },
                    { label: "CACHE", value: pdStats.cache_workers, color: "var(--purple)" },
                    { label: "ROUTER", value: pdStats.router_workers, color: "var(--text-secondary)" },
                  ].map((s) => (
                    <div key={s.label} style={{ background: "var(--bg-3)", borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Warm cache rate: <span style={{ color: "var(--green)", fontWeight: 700 }}>{pdStats.warm_cache_rate.toFixed(1)}%</span> of jobs
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>WORKERS BY ROLE</div>
              {(["Prefill", "Decode", "Cache", "Router"] as const).map((role) => {
                const count = workers.filter((w) => w.role === role).length;
                const pct = workers.length ? Math.round((count / workers.length) * 100) : 0;
                const colors: Record<string, string> = { Prefill: "var(--green)", Decode: "var(--orange)", Cache: "var(--purple)", Router: "var(--text-secondary)" };
                return (
                  <div key={role} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: colors[role], width: 56, fontWeight: 700 }}>{role}</div>
                    <div className="progress-track" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: colors[role] }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", width: 24, textAlign: "right" }}>{count}</div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>NETWORK CAPABILITY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { k: "Total workers", v: stats.total_workers.toString(), c: "var(--text-primary)" },
                  { k: "TEE-capable workers", v: stats.tee_workers.toString(), c: "var(--purple)" },
                  { k: "Confidential job share (1h)", v: `${stats.confidential_share.toFixed(1)}%`, c: "var(--purple)" },
                  { k: "Requests today", v: fmt(stats.requests_today, 0), c: "var(--text-primary)" },
                  { k: "Jobs (1h)", v: fmt(stats.jobs_1h, 0), c: "var(--text-secondary)" },
                  { k: "$LOCK burned", v: fmt(stats.lock_burned, 4), c: "var(--orange)" },
                ].map((r) => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{r.k}</span>
                    <span style={{ color: r.c, fontWeight: 700 }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>TOP — GOODPUT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedByGoodput.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No workers registered yet.</div>
                ) : sortedByGoodput.slice(0, 5).map((w, i) => (
                  <div key={w.address} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 18 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 8)}…</span>
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>{w.goodput_score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "workers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address, role, hardware…" style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} workers</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: selectedWorker ? "1fr 1fr" : "1fr", gap: 14 }}>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {["Address", "Role", "GPU", "Status", "SLA%", "P99 TTFT", "Reliability", "TEE"].map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "24px 12px" }}>
                          No workers found.
                        </td>
                      </tr>
                    ) : filtered.map((w) => (
                      <tr key={w.address} onClick={() => setSelectedWorker(w)}
                        style={{ cursor: "pointer", background: selectedWorker?.address === w.address ? "rgba(255,255,255,0.03)" : undefined }}>
                        <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 11 }}>{w.address.slice(0, 8)}…</td>
                        <td style={{ color: "var(--orange)", fontWeight: 700, fontSize: 11 }}>{w.role}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{w.hardware_tier}</td>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ color: w.status === "Active" ? "var(--green)" : "var(--text-muted)", fontWeight: 700 }}>
                            {w.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: w.sla_pass_rate >= 97 ? "var(--green)" : "var(--yellow)", fontSize: 11 }}>
                          {w.sla_pass_rate.toFixed(1)}%
                        </td>
                        <td style={{ fontSize: 11 }}>{w.p99_ttft_ms}ms</td>
                        <td style={{ minWidth: 100 }}><ScoreBar score={w.reliability_score} color={w.reliability_score > 9000 ? "var(--green)" : "var(--orange)"} /></td>
                        <td style={{ color: w.tee_capable ? "var(--purple)" : "var(--text-muted)", fontWeight: 700, fontSize: 11 }}>
                          {w.tee_capable ? "TEE" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedWorker && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
                className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>WORKER PROFILE</div>
                  <button onClick={() => setSelectedWorker(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", wordBreak: "break-all", marginBottom: 14 }}>
                  {selectedWorker.address}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "Role", v: selectedWorker.role, color: "var(--orange)" },
                    { label: "GPU", v: selectedWorker.hardware_tier, color: "var(--text-primary)" },
                    { label: "Status", v: selectedWorker.status, color: selectedWorker.status === "Active" ? "var(--green)" : "var(--text-secondary)" },
                    { label: "TEE", v: selectedWorker.tee_capable ? "Yes" : "No", color: selectedWorker.tee_capable ? "var(--purple)" : "var(--text-muted)" },
                    { label: "Staked", v: `${fmt(selectedWorker.staked_lock, 0)} $LOCK`, color: "var(--orange)" },
                    { label: "Jobs Today", v: fmt(selectedWorker.jobs_today, 0), color: "var(--text-primary)" },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "var(--bg-3)", borderRadius: 5, padding: "10px" }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>{item.label.toUpperCase()}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 8 }}>RELIABILITY SCORE</div>
                  <ScoreBar score={selectedWorker.reliability_score} color={selectedWorker.reliability_score > 9000 ? "var(--green)" : "var(--orange)"} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    SLA: {selectedWorker.sla_pass_rate.toFixed(2)}% · P99 TTFT: {selectedWorker.p99_ttft_ms}ms
                  </div>
                </div>
                <div style={{ fontSize: 13, color: selectedWorker.penalties_paid > 0 ? "var(--red)" : "var(--green)", fontWeight: 600, marginBottom: 14 }}>
                  {selectedWorker.penalties_paid > 0 ? `${selectedWorker.penalties_paid} $LOCK in penalties` : "No penalties — clean record"}
                </div>
                <a href={`https://solscan.io/account/${selectedWorker.address}`} style={{ color: "var(--orange)", fontSize: 12, textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
                  View on SolScan →
                </a>
              </motion.div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>TOP — RELIABILITY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedByReliability.map((w, i) => (
                  <div key={w.address} onClick={() => setSelectedWorker(w)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 20 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 10)}…</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{w.role}</span>
                    <span style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(w.reliability_score, 0)}</span>
                    {w.tee_capable && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", padding: "1px 4px", borderRadius: 2, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-2)" }}>TEE</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>TOP — GOODPUT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedByGoodput.map((w, i) => (
                  <div key={w.address} onClick={() => setSelectedWorker(w)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 20 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 10)}…</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{w.hardware_tier}</span>
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>{w.goodput_score} g/s</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "receipts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} placeholder="Search job ID…" style={{ maxWidth: 320 }} />
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>
              JOB RECEIPTS — {jobs.length} RECENT
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {["Time", "Job ID", "Model", "Tier", "Worker", "TTFT", "TPOT", "SLA", "Attestation"].map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {jobs.filter((j) => !jobSearch || j.id.includes(jobSearch)).length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "24px 12px" }}>
                        No job receipts yet.
                      </td>
                    </tr>
                  ) : jobs.filter((j) => !jobSearch || j.id.includes(jobSearch)).map((j) => (
                    <tr key={j.id}>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{new Date(jobTimestamp(j.ts)).toLocaleTimeString()}</td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 11 }}>{j.id.slice(0, 14)}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model}</td>
                      <td style={{ fontSize: 10, fontWeight: 700, color: j.sla_tier === "realtime" ? "var(--orange)" : j.sla_tier === "confidential" ? "var(--purple)" : "var(--text-muted)" }}>
                        {j.sla_tier.toUpperCase()}
                      </td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.worker}…</td>
                      <td style={{ color: j.sla_met ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{j.ttft_ms}ms</td>
                      <td style={{ color: "var(--text-secondary)" }}>{j.tpot_ms}ms</td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 11, color: j.sla_met ? "var(--green)" : "var(--red)" }}>{j.sla_met ? "MET" : "MISS"}</span>
                        {!j.sla_met && j.penalty_paid && <span style={{ color: "var(--orange)", fontSize: 10, marginLeft: 4 }}>-{j.penalty_paid}</span>}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {j.attestation_hash ? (
                          <span style={{ color: "var(--purple)", fontFamily: "monospace" }}>{j.attestation_hash.slice(0, 4)}…{j.attestation_hash.slice(-4)}</span>
                        ) : j.confidential ? (
                          <span style={{ color: "var(--text-muted)" }}>pending</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
