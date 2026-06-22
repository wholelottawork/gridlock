"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { generateWorkers, type Worker, type WorkerRole, type WorkerStatus } from "@/lib/mock-data";
import { fetchLeaderboard, type ApiWorker } from "@/lib/api-client";

function adaptWorker(w: ApiWorker): Worker & { grid_points: number } {
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
    grid_points: w.grid_points ?? 0,
  };
}

type BoardTab = "goodput" | "reliability" | "confidential";

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "var(--text-primary)" : rank === 2 ? "var(--text-secondary)" : rank === 3 ? "var(--orange-3)" : "var(--text-muted)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 5,
      background: rank <= 3 ? "rgba(255,255,255,0.06)" : "var(--bg-4)",
      border: `1px solid ${rank <= 3 ? "rgba(255,255,255,0.14)" : "var(--border)"}`,
      color, fontSize: 12, fontWeight: 900,
    }}>
      {rank}
    </span>
  );
}

const pointsForRank = (rank: number, w: Worker, tab: BoardTab) => {
  const base = tab === "goodput" ? w.goodputScore * 10 : w.reliabilityScore;
  return Math.max(0, Math.floor(base / (rank * 0.5)));
};

export default function LeaderboardPage() {
  const [tab, setTab] = useState<BoardTab>("goodput");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [season] = useState({ number: 1, endsIn: "14d 7h", totalPoints: 4812900 });

  useEffect(() => {
    const metric = tab === "goodput" ? "goodput" : tab === "reliability" ? "reliability" : "confidential";
    fetchLeaderboard(metric, 25)
      .then((r) => setWorkers(r.ranked.map(adaptWorker)))
      .catch(() => {
        const mock = generateWorkers(50);
        const sorted = [...mock].sort((a, b) => {
          if (tab === "goodput") return b.goodputScore - a.goodputScore;
          if (tab === "reliability") return b.reliabilityScore - a.reliabilityScore;
          return (b.isConfidential ? 1 : 0) - (a.isConfidential ? 1 : 0) || b.goodputScore - a.goodputScore;
        });
        setWorkers(sorted.map((w) => ({ ...w, grid_points: 0 })));
      });
  }, [tab]);

  // Already sorted by the API; no client-side re-sort needed
  const ranked = workers as (Worker & { grid_points: number })[];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1024, margin: "0 auto", padding: "32px 24px" }}>

      {/* Season header */}
      <div className="card card-orange" style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>SEASON {season.number}</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>GridPoints Leaderboard</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>Earn GridPoints by serving fast. Converts to $LOCK at TGE.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Season ends in</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--orange)" }}>{season.endsIn}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{season.totalPoints.toLocaleString()} total points</div>
        </div>
      </div>

      {/* How points work */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { n: "01", title: "Goodput",     desc: "Points weighted by requests/s within SLA. More throughput = more points." },
          { n: "02", title: "Reliability", desc: "Bonus for high SLA pass rate. Consistent workers earn a reliability multiplier." },
          { n: "03", title: "Confidential",desc: "Extra points for serving TEE jobs. Rare hardware, premium rewards." },
        ].map((c) => (
          <div key={c.n} className="card" style={{ display: "flex", gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "var(--orange)", paddingTop: 2 }}>{c.n}</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, fontWeight: 700 }}>{c.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {([["goodput", "Top Goodput"], ["reliability", "Top Reliability"], ["confidential", "Top Confidential"]] as [BoardTab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn${tab === t ? " active" : ""}`}>{l}</button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Rank</th>
                <th>Worker</th>
                <th>GPU</th>
                <th>Role</th>
                <th>{tab === "goodput" ? "Goodput" : tab === "reliability" ? "Reliability" : "Confidential Jobs"}</th>
                <th>SLA%</th>
                <th>TEE</th>
                <th>GridPoints</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 25).map((w, i) => {
                const rank = i + 1;
                const pts = (w as Worker & { grid_points: number }).grid_points || pointsForRank(rank, w, tab);
                const roleColors: Record<string, string> = { Prefill: "var(--green)", Decode: "var(--orange)", Cache: "var(--purple)", Router: "var(--text-secondary)" };
                return (
                  <motion.tr key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02, duration: 0.25 }}
                    style={{ background: rank <= 3 ? "rgba(255,255,255,0.02)" : undefined }}>
                    <td><RankBadge rank={rank} /></td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 11 }}>
                      {w.address.slice(0, 8)}…{w.address.slice(-4)}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{w.hardwareTier}</td>
                    <td>
                      <span style={{ color: roleColors[w.role] ?? "var(--text-secondary)", fontWeight: 700, fontSize: 11 }}>
                        {w.role.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 900, color: rank === 1 ? "var(--orange)" : "var(--text-primary)" }}>
                      {tab === "goodput"
                        ? w.goodputScore
                        : tab === "reliability"
                          ? w.reliabilityScore.toLocaleString()
                          : w.isConfidential ? Math.floor(w.jobsToday * 0.6).toLocaleString() : "0"}
                    </td>
                    <td style={{ fontWeight: 700, color: w.slaPassRate >= 9800 ? "var(--green)" : "var(--yellow)" }}>
                      {(w.slaPassRate / 100).toFixed(1)}%
                    </td>
                    <td>
                      {w.teeCapable ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-2)" }}>TEE</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 800, color: rank === 1 ? "var(--orange)" : rank <= 3 ? "var(--orange-3)" : "var(--text-primary)" }}>
                      {pts.toLocaleString()}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        GridPoints convert to $LOCK at TGE · 34% of total supply allocated to worker rewards
      </div>
    </motion.div>
  );
}
