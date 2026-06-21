"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getNetworkStats, type NetworkStats } from "@/lib/mock-data";

/* ── Animated counter ─────────────────────────────────────────────────────── */
function Counter({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const [val, setVal] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const duration = 1400;
    const start = Date.now();
    function tick() {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(parseFloat((to * ease).toFixed(decimals)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [to, decimals]);

  return <>{decimals ? val.toFixed(decimals) : val.toLocaleString()}{suffix}</>;
}

/* ── Live ticker ──────────────────────────────────────────────────────────── */
function StatTicker({ stats }: { stats: NetworkStats }) {
  const items = [
    { label: "SLA PASS RATE",     value: `${stats.slaPassRate}%` },
    { label: "ACTIVE WORKERS",    value: stats.activeworkers.toLocaleString() },
    { label: "P99 TTFT",          value: `${stats.p99TtftMs}ms` },
    { label: "PENALTIES PAID",    value: `${stats.totalPenaltiesPaid.toLocaleString()} LOCK` },
    { label: "REQUESTS TODAY",    value: stats.requestsToday.toLocaleString() },
    { label: "CONFIDENTIAL JOBS", value: `${stats.confidentialShare}%` },
    { label: "TEE WORKERS",       value: stats.teeWorkers.toLocaleString() },
  ];
  const doubled = [...items, ...items];

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-1)", overflow: "hidden", padding: "9px 0" }}>
      <div className="ticker-track" style={{ display: "flex", gap: 64, width: "max-content" }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--orange)", display: "inline-block", opacity: 0.6 }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "1px" }}>{item.label}</span>
            <span style={{ fontSize: 11, color: "var(--orange)", fontWeight: 800 }}>{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── SLA tiers data ───────────────────────────────────────────────────────── */
const slaTiers = [
  { tier: "REALTIME",     ttft: "300ms",  tpot: "60ms",  penalty: "2× fee",    use: "Chatbots, voice agents" },
  { tier: "STANDARD",     ttft: "800ms",  tpot: "120ms", penalty: "1× fee",    use: "RAG apps, copilots" },
  { tier: "BATCH",        ttft: "5s",     tpot: "—",     penalty: "0.25× fee", use: "Summarization, embeddings" },
  { tier: "CONFIDENTIAL", ttft: "800ms",  tpot: "120ms", penalty: "1× + slash", use: "Enterprise private-weight" },
];

const competitors = [
  { feature: "Disaggregated Prefill/Decode", render: false, io: false, akash: false, stratum: false },
  { feature: "KV-cache routing",             render: false, io: false, akash: false, stratum: "partial" },
  { feature: "Enforceable latency SLA",      render: false, io: false, akash: false, stratum: false },
  { feature: "Penalty auto-payout",          render: false, io: false, akash: false, stratum: false },
  { feature: "Goodput optimization",         render: false, io: false, akash: false, stratum: "partial" },
  { feature: "Confidential TEE serving",     render: false, io: false, akash: false, stratum: false },
];

function CellVal({ v }: { v: boolean | string }) {
  if (v === true)      return <span style={{ color: "var(--orange)",  fontWeight: 800, fontSize: 13 }}>YES</span>;
  if (v === "partial") return <span style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: 13 }}>PART</span>;
  return <span style={{ color: "var(--bg-4)", fontWeight: 600, fontSize: 13 }}>—</span>;
}

/* ── Stagger variants ─────────────────────────────────────────────────────── */
const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

export default function LandingPage() {
  const [stats, setStats] = useState<NetworkStats>(getNetworkStats());

  useEffect(() => {
    const id = setInterval(() => setStats(getNetworkStats()), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <StatTicker stats={stats} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "88px 24px 72px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
              borderRadius: 4, padding: "4px 12px", marginBottom: 28,
            }}>
              <span className="pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--orange)", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1px" }}>LIVE ON SOLANA — TOKEN: LOCK</span>
            </div>

            <h1 style={{ fontSize: 54, fontWeight: 900, lineHeight: 1.05, marginBottom: 22, letterSpacing: "-1.5px" }}>
              AI Inference with a{" "}
              <span className="gradient-text">Real SLA</span>
            </h1>

            <p style={{ fontSize: 17, color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: 36, maxWidth: 480 }}>
              Miss the latency target, get paid back automatically. On-chain enforceable SLAs backed by worker stake, settled in one Solana slot via PermanentDelegate.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/worker" className="btn btn-primary" style={{ fontSize: 14 }}>
                Run a Worker Node
              </Link>
              <Link href="/console" className="btn btn-ghost" style={{ fontSize: 14 }}>
                Open SLA Console
              </Link>
            </div>
          </motion.div>

          {/* Right — stat cards */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {[
              { label: "SLA PASS RATE",    to: stats.slaPassRate,         suffix: "%",    decimals: 1, accent: true },
              { label: "P99 TTFT",         to: stats.p99TtftMs,           suffix: "ms",   decimals: 0, accent: false },
              { label: "PENALTIES PAID",   to: stats.totalPenaltiesPaid,  suffix: " LOCK", decimals: 0, accent: true },
              { label: "ACTIVE WORKERS",   to: stats.activeworkers,       suffix: "",     decimals: 0, accent: false },
            ].map((c) => (
              <motion.div key={c.label} variants={fadeUp} transition={{ duration: 0.5, ease: "easeOut" }}
                style={{
                  background: "var(--bg-2)",
                  border: c.accent ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "20px",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{c.label}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: c.accent ? "var(--orange)" : "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.5px" }}>
                  <Counter to={c.to} suffix={c.suffix} decimals={c.decimals} />
                </div>
                {c.label === "ACTIVE WORKERS" && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{stats.teeWorkers} TEE-capable</div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Code snippet ──────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-1)" }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>FOR DEVELOPERS</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, marginBottom: 16, letterSpacing: "-0.5px" }}>One URL change. Guaranteed latency.</h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: 24, fontSize: 15 }}>
              Drop-in OpenAI replacement. If the request misses your SLA target, the penalty is auto-credited on-chain — no dispute, no claim, no waiting.
            </p>
            <Link href="/console" style={{ fontSize: 13, color: "var(--orange)", fontWeight: 700, textDecoration: "none", letterSpacing: "0.3px" }}>
              Open SLA Console →
            </Link>
          </div>

          <div style={{
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "24px",
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 13,
            lineHeight: 1.9,
          }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{"// Change one URL, get a latency guarantee"}</div>
            <div><span style={{ color: "#888" }}>import</span> <span style={{ color: "var(--text-primary)" }}>OpenAI</span> <span style={{ color: "#888" }}>from</span> <span style={{ color: "#aaa" }}>&apos;openai&apos;</span></div>
            <br />
            <div><span style={{ color: "#888" }}>const</span> <span style={{ color: "#ccc" }}>client</span> <span style={{ color: "var(--text-primary)" }}>=</span> <span style={{ color: "#888" }}>new</span> <span style={{ color: "#fff" }}>OpenAI</span><span>{"({"}</span></div>
            <div style={{ paddingLeft: 16 }}><span style={{ color: "#ccc" }}>baseURL</span><span>:</span> <span style={{ color: "#aaa" }}>&apos;https://api.gridlock.xyz/v1&apos;</span><span>,</span></div>
            <div style={{ paddingLeft: 16 }}><span style={{ color: "#ccc" }}>apiKey</span><span>:</span> <span style={{ color: "var(--text-primary)" }}>GRIDLOCK_KEY</span><span>,</span></div>
            <div><span>{"}"}</span><span>)</span></div>
            <br />
            <div><span style={{ color: "#888" }}>const</span> <span style={{ color: "#ccc" }}>res</span> <span>=</span> <span style={{ color: "#888" }}>await</span> <span style={{ color: "#ccc" }}>client</span><span>.chat.completions.</span><span style={{ color: "#fff" }}>create</span><span>{"({"}</span></div>
            <div style={{ paddingLeft: 16 }}><span style={{ color: "#ccc" }}>model</span><span>:</span> <span style={{ color: "#aaa" }}>&apos;llama-3.1-70b&apos;</span><span>,</span></div>
            <div style={{ paddingLeft: 16 }}><span style={{ color: "#ccc" }}>gridlock</span><span>:</span> <span>{"{"}</span> <span style={{ color: "#ccc" }}>sla</span><span>:</span> <span style={{ color: "#aaa" }}>&apos;realtime&apos;</span> <span>{"}"}</span></div>
            <div><span>{"}"}</span><span>)</span></div>
            <br />
            <div style={{ color: "var(--text-muted)" }}>{"// res.gridlock = { ttftMs: 187, slaMet: true }"}</div>
          </div>
        </div>
      </motion.section>

      {/* ── SLA Tiers ─────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1.5px", marginBottom: 14 }}>SLA TIERS</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Pick your latency guarantee</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: 12, fontSize: 14 }}>Miss the target — penalty auto-pays from worker stake directly to your wallet.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {slaTiers.map((t, i) => (
            <motion.div
              key={t.tier}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              style={{
                background: "var(--bg-2)",
                border: i === 0 ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                borderRadius: 8,
                padding: "24px",
              }}
            >
              <div style={{ fontSize: 10, color: i === 0 ? "var(--orange)" : "var(--text-muted)", fontWeight: 800, letterSpacing: "1.5px", marginBottom: 14 }}>{t.tier}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: i === 0 ? "var(--orange)" : "var(--text-primary)", marginBottom: 4, letterSpacing: "-0.5px" }}>{t.ttft}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 18 }}>TPOT {t.tpot}</div>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 16 }} />
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                <span style={{ color: "var(--red)", fontWeight: 700 }}>Penalty</span>  {t.penalty}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.use}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Comparison table ──────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1.5px", marginBottom: 14 }}>COMPETITIVE POSITION</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>The only one that sells a guarantee</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  {["Feature", "Render", "io.net", "Akash", "Stratum", "GRIDLOCK"].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? "left" : "center",
                      color: i === 5 ? "var(--orange)" : undefined,
                      fontWeight: i === 5 ? 800 : undefined,
                      fontSize: 11,
                      letterSpacing: "0.5px",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((row) => (
                  <tr key={row.feature}>
                    <td style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{row.feature}</td>
                    <td style={{ textAlign: "center" }}><CellVal v={row.render} /></td>
                    <td style={{ textAlign: "center" }}><CellVal v={row.io} /></td>
                    <td style={{ textAlign: "center" }}><CellVal v={row.akash} /></td>
                    <td style={{ textAlign: "center" }}><CellVal v={row.stratum} /></td>
                    <td style={{ textAlign: "center" }}><CellVal v={true} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
        style={{ maxWidth: 1280, margin: "0 auto", padding: "88px 24px", textAlign: "center" }}
      >
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 16, letterSpacing: "-1px" }}>
          Ready to earn or build?
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
          GPU owners: plug in and earn LOCK per request within SLA.<br />
          Developers: change one URL, get a latency guarantee.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
          <Link href="/worker" className="btn btn-primary" style={{ padding: "14px 36px", fontSize: 15 }}>
            Run a Worker Node
          </Link>
          <Link href="/console" className="btn btn-ghost" style={{ padding: "14px 36px", fontSize: 15 }}>
            Open SLA Console
          </Link>
        </div>
        <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-muted)" }}>
          Pausing is free. Penalties are automatic. No trust required.
        </p>
      </motion.section>
    </div>
  );
}
