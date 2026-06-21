"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { generateWorkers, getNetworkStats, generateJobs, type Worker, type Job, type WorkerRole, type WorkerStatus } from "@/lib/mock-data";
import { fetchNetworkStats, fetchWorkers, fetchJobs, type ApiWorker, type ApiJob, type ApiNetworkStats } from "@/lib/api-client";

function adaptWorker(w: ApiWorker): Worker {
  return {
    id: w.address,
    address: w.address,
    role: w.role as WorkerRole,
    status: w.status as WorkerStatus,
    reliabilityScore: w.reliability_score,
    slaPassRate: Math.round(w.sla_pass_rate * 100),
    p99TtftMs: w.p99_ttft_ms,
    goodputScore: w.goodput_score,
    stakedLock: w.staked_lock,
    teeCapable: w.tee_capable,
    penaltiesPaid: w.penalties_paid,
    hardwareTier: w.hardware_tier,
    jobsToday: w.jobs_today,
    earningsToday: w.earnings_today,
    isConfidential: w.is_confidential,
  };
}

function adaptStats(s: ApiNetworkStats): ReturnType<typeof getNetworkStats> {
  return {
    activeworkers: s.active_workers,
    slaPassRate: s.sla_pass_rate,
    p99TtftMs: s.p99_ttft_ms,
    totalPenaltiesPaid: s.total_penalties_lock,
    requestsToday: s.requests_today,
    confidentialShare: s.confidential_share,
    teeWorkers: s.tee_workers,
  };
}

function adaptJob(j: ApiJob): Job {
  return {
    id: j.id,
    customer: j.customer,
    model: j.model,
    slaTier: j.sla_tier,
    ttftMs: j.ttft_ms,
    tpotMs: j.tpot_ms,
    slaMet: j.sla_met,
    confidential: j.confidential,
    worker: j.worker,
    ts: j.ts * 1000,
    penaltyPaid: j.penalty_paid ?? undefined,
  };
}

type ExplorerTab = "network" | "workers" | "receipts";

function ScoreBar({ score, max = 10000, color = "var(--orange)" }: { score: number; max?: number; color?: string }) {
  const pct = (score / max) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="progress-track" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, width: 40, textAlign: "right" }}>{score.toLocaleString()}</span>
    </div>
  );
}

export default function ExplorerPage() {
  const [tab, setTab] = useState<ExplorerTab>("network");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState(getNetworkStats());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [jobSearch, setJobSearch] = useState("");

  useEffect(() => {
    // Try real API first, fall back to mock
    fetchWorkers({ limit: 50 })
      .then((r) => setWorkers(r.workers.map(adaptWorker)))
      .catch(() => setWorkers(generateWorkers(30)));

    fetchJobs({ limit: 40 })
      .then((r) => setJobs(r.jobs.map(adaptJob)))
      .catch(() => setJobs(generateJobs(40)));

    fetchNetworkStats()
      .then((s) => setStats(adaptStats(s)))
      .catch(() => setStats(getNetworkStats()));

    const id = setInterval(() => {
      fetchNetworkStats().then((s) => setStats(adaptStats(s))).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const filtered = workers.filter(
    (w) => w.address.toLowerCase().includes(search.toLowerCase()) ||
            w.role.toLowerCase().includes(search.toLowerCase()) ||
            w.hardwareTier.toLowerCase().includes(search.toLowerCase())
  );

  const sortedByGoodput = [...workers].sort((a, b) => b.goodputScore - a.goodputScore).slice(0, 10);
  const sortedByReliability = [...workers].sort((a, b) => b.reliabilityScore - a.reliabilityScore).slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Explorer</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Public, on-chain-verifiable network and worker history. No account required.</p>
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {([["network", "Network Health"], ["workers", "Workers"], ["receipts", "Job Receipts"]] as [ExplorerTab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn${tab === t ? " active" : ""}`}>{l}</button>
        ))}
      </div>

      {tab === "network" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "SLA PASS RATE",       value: `${stats.slaPassRate}%`,                         accent: "var(--green)" },
              { label: "P99 TTFT",            value: `${stats.p99TtftMs}ms`,                          accent: "var(--text-primary)" },
              { label: "ACTIVE WORKERS",      value: stats.activeworkers.toString(),                   accent: "var(--text-primary)" },
              { label: "TOTAL PENALTIES",     value: `${stats.totalPenaltiesPaid.toLocaleString()} LOCK`, accent: "var(--orange)" },
            ].map((s) => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
              </div>
            ))}
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
                  { k: "TEE-capable workers",    v: stats.teeWorkers,                      c: "var(--purple)" },
                  { k: "Confidential job share", v: `${stats.confidentialShare}%`,         c: "var(--purple)" },
                  { k: "Requests today",         v: stats.requestsToday.toLocaleString(), c: "var(--text-primary)" },
                ].map((r) => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{r.k}</span>
                    <span style={{ color: r.c, fontWeight: 700 }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Updated every 3s · Solana on-chain</div>
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>TOP — GOODPUT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedByGoodput.slice(0, 5).map((w, i) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 18 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 8)}…</span>
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>{w.goodputScore}</span>
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
                    {filtered.map((w) => (
                      <tr key={w.id} onClick={() => setSelectedWorker(w)}
                        style={{ cursor: "pointer", background: selectedWorker?.id === w.id ? "rgba(255,255,255,0.03)" : undefined }}>
                        <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 11 }}>{w.address.slice(0, 8)}…</td>
                        <td style={{ color: "var(--orange)", fontWeight: 700, fontSize: 11 }}>{w.role}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{w.hardwareTier}</td>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ color: w.status === "Active" ? "var(--green)" : "var(--text-muted)", fontWeight: 700 }}>
                            {w.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: w.slaPassRate >= 9800 ? "var(--green)" : "var(--yellow)", fontSize: 11 }}>
                          {(w.slaPassRate / 100).toFixed(1)}%
                        </td>
                        <td style={{ fontSize: 11 }}>{w.p99TtftMs}ms</td>
                        <td style={{ minWidth: 100 }}><ScoreBar score={w.reliabilityScore} color={w.reliabilityScore > 9000 ? "var(--green)" : "var(--orange)"} /></td>
                        <td style={{ color: w.teeCapable ? "var(--purple)" : "var(--text-muted)", fontWeight: 700, fontSize: 11 }}>
                          {w.teeCapable ? "TEE" : "—"}
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
                    { label: "Role",        v: selectedWorker.role,                                color: "var(--orange)" },
                    { label: "GPU",         v: selectedWorker.hardwareTier,                        color: "var(--text-primary)" },
                    { label: "Status",      v: selectedWorker.status,                              color: selectedWorker.status === "Active" ? "var(--green)" : "var(--text-secondary)" },
                    { label: "TEE",         v: selectedWorker.teeCapable ? "Yes" : "No",           color: selectedWorker.teeCapable ? "var(--purple)" : "var(--text-muted)" },
                    { label: "Staked",      v: `${selectedWorker.stakedLock.toLocaleString()} LOCK`, color: "var(--orange)" },
                    { label: "Jobs Today",  v: selectedWorker.jobsToday.toLocaleString(),          color: "var(--text-primary)" },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "var(--bg-3)", borderRadius: 5, padding: "10px" }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>{item.label.toUpperCase()}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 8 }}>RELIABILITY SCORE</div>
                  <ScoreBar score={selectedWorker.reliabilityScore} color={selectedWorker.reliabilityScore > 9000 ? "var(--green)" : "var(--orange)"} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    SLA: {(selectedWorker.slaPassRate / 100).toFixed(2)}% · P99 TTFT: {selectedWorker.p99TtftMs}ms
                  </div>
                </div>
                <div style={{ fontSize: 13, color: selectedWorker.penaltiesPaid > 0 ? "var(--red)" : "var(--green)", fontWeight: 600, marginBottom: 14 }}>
                  {selectedWorker.penaltiesPaid > 0 ? `${selectedWorker.penaltiesPaid} LOCK in penalties` : "No penalties — clean record"}
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
                  <div key={w.id} onClick={() => setSelectedWorker(w)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 20 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 10)}…</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{w.role}</span>
                    <span style={{ color: "var(--green)", fontWeight: 700 }}>{w.reliabilityScore.toLocaleString()}</span>
                    {w.teeCapable && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", padding: "1px 4px", borderRadius: 2, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-2)" }}>TEE</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>TOP — GOODPUT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedByGoodput.map((w, i) => (
                  <div key={w.id} onClick={() => setSelectedWorker(w)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                    <span style={{ color: i < 3 ? "var(--orange)" : "var(--text-muted)", fontWeight: 900, width: 20 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", flex: 1 }}>{w.address.slice(0, 10)}…</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{w.hardwareTier}</span>
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>{w.goodputScore} g/s</span>
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
                  {jobs.filter((j) => !jobSearch || j.id.includes(jobSearch)).map((j) => (
                    <tr key={j.id}>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{new Date(j.ts).toLocaleTimeString()}</td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 11 }}>{j.id.slice(0, 14)}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model}</td>
                      <td style={{ fontSize: 10, fontWeight: 700, color: j.slaTier === "realtime" ? "var(--orange)" : j.slaTier === "confidential" ? "var(--purple)" : "var(--text-muted)" }}>
                        {j.slaTier.toUpperCase()}
                      </td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.worker}…</td>
                      <td style={{ color: j.slaMet ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{j.ttftMs}ms</td>
                      <td style={{ color: "var(--text-secondary)" }}>{j.tpotMs}ms</td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 11, color: j.slaMet ? "var(--green)" : "var(--red)" }}>{j.slaMet ? "MET" : "MISS"}</span>
                        {!j.slaMet && j.penaltyPaid && <span style={{ color: "var(--orange)", fontSize: 10, marginLeft: 4 }}>-{j.penaltyPaid}</span>}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {j.confidential ? (
                          <span style={{ color: "var(--purple)", fontFamily: "monospace" }}>3f8a…c2b1 →</span>
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
