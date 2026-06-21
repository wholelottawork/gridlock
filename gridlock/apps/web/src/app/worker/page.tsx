"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { generateJobs, type Job } from "@/lib/mock-data";
import { ChartWrapper } from "@/components/chart-wrapper";

type WorkerState = "Active" | "Paused" | "Draining";

function generateLatencyPoints(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    t: `${i}`,
    ttft: Math.floor(Math.random() * 200 + 100),
    tpot: Math.floor(Math.random() * 60 + 30),
  }));
}

export default function WorkerPage() {
  const [status, setStatus] = useState<WorkerState>("Active");
  const [confidential, setConfidential] = useState(false);
  const [latency, setLatency] = useState<ReturnType<typeof generateLatencyPoints>>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState({ lock: 142.38, confidentialPremium: 9.44 });
  const [slaPass, setSlaPass] = useState(98.2);
  const [goodput, setGoodput] = useState(847);
  const [reliabilityScore] = useState(9240);
  const [stakedLock] = useState(25000);
  const [inFlight, setInFlight] = useState(3);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLatency(generateLatencyPoints());
    setJobs(generateJobs(8));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (status !== "Active") return;
      setLatency((prev) => [
        ...prev.slice(1),
        { t: String(Date.now()), ttft: Math.floor(Math.random() * 200 + 100), tpot: Math.floor(Math.random() * 60 + 30) },
      ]);
      setEarnings((e) => ({
        lock: parseFloat((e.lock + Math.random() * 0.4).toFixed(2)),
        confidentialPremium: confidential ? parseFloat((e.confidentialPremium + Math.random() * 0.12).toFixed(2)) : e.confidentialPremium,
      }));
      setSlaPass((p) => parseFloat(Math.min(99.9, p + (Math.random() - 0.48) * 0.1).toFixed(1)));
      setGoodput((g) => Math.max(100, g + Math.floor((Math.random() - 0.4) * 40)));
      setJobs(generateJobs(8));
    }, 1500);
    return () => clearInterval(id);
  }, [status, confidential]);

  function handleToggle() {
    if (status === "Active") {
      setStatus("Draining");
      drainTimerRef.current = setTimeout(() => { setStatus("Paused"); setInFlight(0); }, 3000);
    } else if (status === "Paused") {
      setStatus("Active");
      setInFlight(Math.floor(Math.random() * 5) + 1);
    } else {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      setStatus("Paused");
    }
  }

  const statusColor = status === "Active" ? "var(--green)" : status === "Draining" ? "var(--yellow)" : "var(--text-secondary)";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Worker Dashboard</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <span style={{ fontFamily: "monospace" }}>7xKm…b3Rq</span>
            <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
            RTX 4090
            <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
            Prefill
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 6,
          background: `${statusColor}14`,
          border: `1px solid ${statusColor}40`,
          color: statusColor, fontSize: 12, fontWeight: 700,
        }}>
          <span className={status === "Active" ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          {status.toUpperCase()}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Status + Controls */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>STATUS & CONTROLS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button onClick={handleToggle} style={{
                width: "100%", height: 56, borderRadius: 8,
                background: status === "Active" ? "var(--green)" : status === "Draining" ? "var(--yellow)" : "var(--bg-3)",
                border: "none", cursor: "pointer", fontSize: 14, fontWeight: 800,
                color: status === "Paused" ? "var(--text-secondary)" : "#000",
                transition: "all 0.2s",
              }}>
                {status === "Active" ? "ACTIVE — Click to Pause" : status === "Draining" ? `Draining ${inFlight} jobs…` : "PAUSED — Click to Resume"}
              </button>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                {status === "Active" && "Graceful drain on pause — no penalty"}
                {status === "Draining" && `Waiting for ${inFlight} in-flight jobs to complete`}
                {status === "Paused" && "Not accepting new requests"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: "var(--bg-3)", borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: confidential ? "var(--purple)" : "var(--text-secondary)", marginBottom: 2 }}>Confidential Mode</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>TEE-only jobs · premium pay</div>
              </div>
              <div className={`toggle${confidential ? " on" : ""}`}
                style={{ background: confidential ? "var(--purple)" : undefined, borderColor: confidential ? "var(--purple)" : undefined }}
                onClick={() => setConfidential((c) => !c)}>
                <div className="toggle-thumb" />
              </div>
            </div>
          </div>
        </div>

        {/* Earnings */}
        <div className="card card-orange">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>EARNINGS TODAY</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--orange)", letterSpacing: "-1px" }}>{earnings.lock.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>LOCK</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{jobs.filter((j) => j.slaMet).length}/{jobs.length}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>SLA met / batch</div>
            </div>
            <div style={{ background: confidential ? "rgba(255,255,255,0.04)" : "var(--bg-3)", borderRadius: 6, padding: "10px", border: confidential ? "1px solid var(--border-2)" : "1px solid transparent" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: confidential ? "var(--purple)" : "var(--text-secondary)" }}>+{earnings.confidentialPremium.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>TEE premium</div>
            </div>
          </div>
        </div>

        {/* SLA Performance */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>SLA PERFORMANCE</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: slaPass >= 99 ? "var(--green)" : slaPass >= 97 ? "var(--yellow)" : "var(--red)", letterSpacing: "-1px" }}>
            {slaPass}%
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>pass rate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["realtime", "standard", "confidential"] as const).map((tier) => {
              const tierJobs = jobs.filter((j) => j.slaTier === tier);
              const passed = tierJobs.filter((j) => j.slaMet).length;
              const pct = tierJobs.length ? Math.round((passed / tierJobs.length) * 100) : 100;
              const colors: Record<string, string> = { realtime: "var(--green)", standard: "var(--orange)", confidential: "var(--purple)" };
              return (
                <div key={tier}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: colors[tier], fontWeight: 700, textTransform: "uppercase" }}>{tier}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{pct}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: colors[tier] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Latency chart */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>LIVE LATENCY</div>
          <ChartWrapper height={160}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latency}>
                <XAxis hide />
                <YAxis hide domain={[0, 600]} />
                <Tooltip contentStyle={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} labelStyle={{ display: "none" }} />
                <ReferenceLine y={300} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="ttft" stroke="#ffffff" dot={false} strokeWidth={2} name="TTFT ms" />
                <Line type="monotone" dataKey="tpot" stroke="rgba(255,255,255,0.25)" dot={false} strokeWidth={1.5} name="TPOT ms" />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-primary)" }}>— TTFT</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— TPOT</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>- - SLA limit</span>
          </div>
        </div>

        {/* Goodput */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>GOODPUT</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "var(--orange)" }}>{goodput}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>req/s within SLA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Network rank</span>
              <span style={{ color: "var(--orange)", fontWeight: 700 }}>#14</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>GPU util</span>
              <span style={{ fontWeight: 700 }}>87%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Role</span>
              <span style={{ fontWeight: 700 }}>Prefill</span>
            </div>
          </div>
        </div>

        {/* Reliability */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>RELIABILITY</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "var(--green)" }}>{reliabilityScore.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>/10000</div>
          <div className="progress-track" style={{ marginBottom: 10 }}>
            <div className="progress-fill" style={{ width: `${(reliabilityScore / 10000) * 100}%`, background: "var(--green)" }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Next tier at <span style={{ color: "var(--orange)", fontWeight: 700 }}>9,500</span> — unlocks Realtime jobs
          </div>
        </div>
      </div>

      {/* Stake + Recent Jobs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>STAKED LOCK</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>{stakedLock.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>LOCK</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--orange)" }}>2.0×</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>earnings mult.</div>
            </div>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--red)" }}>5,000</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>SLA collateral</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--green)", background: "rgba(34,204,102,0.06)", borderRadius: 5, padding: "8px" }}>
            8% APY · ~{(stakedLock * 0.08 / 365).toFixed(2)} LOCK/day
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>RECENT JOBS</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {["Job ID", "Model", "Tier", "TTFT", "TPOT", "SLA", "Penalty"].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.id.slice(0, 10)}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model.split("-").slice(0, 2).join("-")}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, color: j.slaTier === "realtime" ? "var(--orange)" : j.slaTier === "confidential" ? "var(--purple)" : "var(--text-muted)" }}>
                        {j.slaTier.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ color: j.ttftMs > 300 ? "var(--red)" : "var(--text-primary)", fontWeight: 700 }}>{j.ttftMs}ms</td>
                    <td style={{ color: "var(--text-secondary)" }}>{j.tpotMs}ms</td>
                    <td><span style={{ fontWeight: 800, fontSize: 11, color: j.slaMet ? "var(--green)" : "var(--red)" }}>{j.slaMet ? "MET" : "MISS"}</span></td>
                    <td style={{ color: "var(--red)", fontSize: 11 }}>
                      {j.penaltyPaid ? `-${j.penaltyPaid} LOCK` : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
