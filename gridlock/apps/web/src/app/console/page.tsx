"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { generateJobs, type Job, type SlaTier } from "@/lib/mock-data";
import { ChartWrapper } from "@/components/chart-wrapper";

type Tab = "overview" | "monitor" | "penalties" | "keys";

const tiers: { id: SlaTier; label: string; ttft: string; penalty: string }[] = [
  { id: "realtime",     label: "Realtime",     ttft: "< 300ms",      penalty: "2× fee" },
  { id: "standard",     label: "Standard",     ttft: "< 800ms",      penalty: "1× fee" },
  { id: "batch",        label: "Batch",        ttft: "< 5s",         penalty: "0.25× fee" },
  { id: "confidential", label: "Confidential", ttft: "< 800ms + TEE", penalty: "1× + slash" },
];

function SlaTag({ tier }: { tier: SlaTier }) {
  const accent = tier === "realtime" ? "var(--text-primary)" : "var(--text-secondary)";
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 3,
      background: "var(--bg-4)",
      border: "1px solid var(--border-2)",
      color: accent, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
    }}>
      {tier.toUpperCase()}{tier === "confidential" ? " TEE" : ""}
    </span>
  );
}

function SlaResult({ met }: { met: boolean }) {
  return (
    <span style={{ color: met ? "var(--green)" : "var(--red)", fontWeight: 800, fontSize: 11, letterSpacing: "0.5px" }}>
      {met ? "MET" : "MISS"}
    </span>
  );
}

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedTier, setSelectedTier] = useState<SlaTier>("realtime");
  const [privacyDefault, setPrivacyDefault] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [penalties, setPenalties] = useState<Job[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<{ t: number; p99: number; p50: number }[]>([]);

  useEffect(() => {
    const allJobs = generateJobs(50);
    setJobs(allJobs);
    setPenalties(allJobs.filter((j) => !j.slaMet && j.penaltyPaid));
    setLatencyHistory(Array.from({ length: 20 }, (_, i) => ({
      t: i,
      p99: Math.floor(Math.random() * 200 + 120),
      p50: Math.floor(Math.random() * 100 + 80),
    })));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const newJobs = generateJobs(25);
      setJobs(newJobs);
      setPenalties((prev) => [...newJobs.filter((j) => !j.slaMet && j.penaltyPaid), ...prev].slice(0, 30));
      setLatencyHistory((prev) => [
        ...prev.slice(1),
        { t: Date.now(), p99: Math.floor(Math.random() * 200 + 120), p50: Math.floor(Math.random() * 100 + 80) },
      ]);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const passRate = jobs.length ? Math.round((jobs.filter((j) => j.slaMet).length / jobs.length) * 100) : 0;
  const p99Ttft = jobs.length ? Math.max(...jobs.map((j) => j.ttftMs)) : 0;
  const totalPenaltyCredited = penalties.reduce((s, j) => s + (j.penaltyPaid ?? 0), 0);
  const confidentialPct = jobs.length ? Math.round((jobs.filter((j) => j.confidential).length / jobs.length) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>SLA Console</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Monitor inference SLA in real time. Penalties auto-credited on miss.</p>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {(["overview", "monitor", "penalties", "keys"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn${tab === t ? " active" : ""}`}>
            {t.charAt(0).toUpperCase() + t.slice(1).replace("keys", "API Keys")}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "SLA PASS RATE",      value: `${passRate}%`,                         accent: passRate >= 99 ? "var(--green)" : passRate >= 96 ? "var(--yellow)" : "var(--red)" },
              { label: "P99 TTFT",           value: `${p99Ttft}ms`,                         accent: "var(--text-primary)" },
              { label: "PENALTIES CREDITED", value: `${totalPenaltyCredited.toFixed(4)} LOCK`, accent: "var(--orange)" },
              { label: "CONFIDENTIAL",       value: `${confidentialPct}%`,                  accent: "var(--purple)" },
            ].map((s) => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>P99 TTFT — LAST 20 INTERVALS</div>
            <ChartWrapper height={150}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyHistory}>
                  <XAxis hide /><YAxis hide domain={[0, 800]} />
                  <Tooltip contentStyle={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} labelStyle={{ display: "none" }} />
                  <ReferenceLine y={300} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 2" />
                  <ReferenceLine y={800} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="p99" stroke="#ffffff" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="p50" stroke="rgba(255,255,255,0.25)" dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </ChartWrapper>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-primary)" }}>— p99</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— p50</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>- - SLA limit</span>
            </div>
          </div>

          {/* SLA Settings */}
          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>SLA SETTINGS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 10 }}>Default SLA Tier</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tiers.map((t) => (
                    <button key={t.id} onClick={() => setSelectedTier(t.id)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 6,
                      border: selectedTier === t.id ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                      background: selectedTier === t.id ? "var(--orange-dim)" : "var(--bg-3)",
                      cursor: "pointer", color: "var(--text-primary)",
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: selectedTier === t.id ? "var(--orange)" : "var(--text-secondary)" }}>{t.label}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.ttft} · {t.penalty}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 10 }}>Privacy Settings</div>
                <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: privacyDefault ? "var(--orange)" : "var(--text-primary)" }}>
                        Privacy by Default
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Route to TEE-capable workers only</div>
                    </div>
                    <div className={`toggle${privacyDefault ? " on" : ""}`} onClick={() => setPrivacyDefault((p) => !p)}>
                      <div className="toggle-thumb" />
                    </div>
                  </div>
                  {privacyDefault && (
                    <div style={{ fontSize: 11, color: "var(--orange)", background: "var(--orange-dim)", borderRadius: 4, padding: "8px", marginTop: 8 }}>
                      All requests will include TEE attestation hash in response
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "monitor" && (
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
            LIVE REQUEST STREAM — {jobs.length} RECENT
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {["Time", "Job ID", "Model", "Tier", "Worker", "TTFT", "TPOT", "SLA"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{new Date(j.ts).toLocaleTimeString()}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.id.slice(0, 12)}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model}</td>
                    <td><SlaTag tier={j.slaTier} /></td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.worker}…</td>
                    <td style={{ color: j.ttftMs > 300 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{j.ttftMs}ms</td>
                    <td style={{ color: "var(--text-secondary)" }}>{j.tpotMs}ms</td>
                    <td><SlaResult met={j.slaMet} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "penalties" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="card card-orange">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>TOTAL CREDITED</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--orange)" }}>{totalPenaltyCredited.toFixed(4)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>LOCK auto-credited to you</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>MISSES</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--red)" }}>{penalties.length}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>SLA misses in window</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>HOW IT WORKS</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Penalties transfer directly from worker staked LOCK to your wallet via PermanentDelegate — no dispute needed.
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>PENALTY LOG</div>
            {penalties.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700 }}>ALL CLEAR</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>All requests met SLA</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {["Time", "Job ID", "Tier", "TTFT", "Limit", "Penalty", "Tx"].map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((j) => {
                    const limit = j.slaTier === "realtime" ? 300 : j.slaTier === "batch" ? 5000 : 800;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{new Date(j.ts).toLocaleTimeString()}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{j.id.slice(0, 14)}</td>
                        <td><SlaTag tier={j.slaTier} /></td>
                        <td style={{ color: "var(--red)", fontWeight: 700 }}>{j.ttftMs}ms</td>
                        <td style={{ color: "var(--text-muted)" }}>{limit}ms</td>
                        <td style={{ color: "var(--orange)", fontWeight: 700 }}>+{j.penaltyPaid?.toFixed(4)} LOCK</td>
                        <td><a href="#" style={{ color: "var(--orange)", fontSize: 11, textDecoration: "none" }}>SolScan →</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>API KEYS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { name: "Production",  key: "gk-prod-7xKm9bNqR3tY…", tier: "realtime", tee: true,  requests: "48,291" },
                { name: "Development", key: "gk-dev-2mPw4cVsL8kE…",  tier: "standard", tee: false, requests: "1,204" },
              ].map((k) => (
                <div key={k.name} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg-3)", borderRadius: 6, padding: "12px 16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{k.name}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{k.key}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{k.requests} req</div>
                  <span style={{ padding: "2px 8px", borderRadius: 3, background: "var(--orange-dim)", border: "1px solid var(--orange-border)", color: "var(--orange)", fontSize: 10, fontWeight: 700 }}>{k.tier.toUpperCase()}</span>
                  {k.tee && <span style={{ padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-2)", color: "var(--text-secondary)", fontSize: 10, fontWeight: 700 }}>TEE</span>}
                  <button style={{ background: "var(--bg-4)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Copy</button>
                </div>
              ))}
              <button className="btn btn-primary" style={{ marginTop: 8, width: "fit-content", fontSize: 13 }}>
                Create New Key
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>QUICKSTART</div>
            <div style={{ background: "var(--bg-0)", borderRadius: 6, padding: "16px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "var(--text-secondary)" }}>
              <div style={{ color: "var(--text-muted)" }}>npm install openai</div>
              <br />
              <div><span style={{ color: "#888" }}>import</span> OpenAI <span style={{ color: "#888" }}>from</span> <span style={{ color: "#aaa" }}>&apos;openai&apos;</span></div>
              <div><span style={{ color: "#888" }}>const</span> client = <span style={{ color: "#888" }}>new</span> <span style={{ color: "#fff" }}>OpenAI</span>{"({ baseURL: 'https://api.gridlock.xyz/v1', apiKey: GRIDLOCK_KEY })"}</div>
              <div><span style={{ color: "#888" }}>const</span> res = <span style={{ color: "#888" }}>await</span> client.chat.completions.<span style={{ color: "#fff" }}>create</span>{"({"}</div>
              <div style={{ paddingLeft: 16 }}>model: <span style={{ color: "#aaa" }}>&apos;llama-3.1-70b&apos;</span>,</div>
              <div style={{ paddingLeft: 16 }}>messages: [{"{"} role: <span style={{ color: "#aaa" }}>&apos;user&apos;</span>, content: <span style={{ color: "#aaa" }}>&apos;Hello&apos;</span> {"}"}],</div>
              <div style={{ paddingLeft: 16 }}>gridlock: {"{"} sla: <span style={{ color: "#aaa" }}>&apos;realtime&apos;</span> {"}"}</div>
              <div>{"}"}</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
