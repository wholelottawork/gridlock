"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    { label: "PENALTIES PAID",    value: `${stats.totalPenaltiesPaid.toLocaleString()} $LOCK` },
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

/* ── Code block ───────────────────────────────────────────────────────────── */
function CodeBlock({ lines }: { lines: { text: string; dim?: boolean; indent?: number }[] }) {
  const [copied, setCopied] = useState(false);
  const full = lines.map((l) => l.text).join("\n");
  function copy() {
    navigator.clipboard.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }
  return (
    <div style={{ background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57","#febc2e","#28c840"].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
        </div>
        <button onClick={copy} style={{ background: "none", border: "none", color: copied ? "var(--green)" : "var(--text-muted)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
          {copied ? "COPIED вњ“" : "COPY"}
        </button>
      </div>
      <div style={{ padding: "20px 24px", fontFamily: "monospace", fontSize: 13, lineHeight: 2 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ paddingLeft: (l.indent ?? 0) * 16, color: l.dim ? "var(--text-muted)" : "var(--text-secondary)", whiteSpace: "pre" }}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

type Role = "customer" | "worker";

const slaTiers = [
  { tier: "REALTIME",     ttft: "300ms",  penalty: "2Г— fee",     use: "Chatbots, voice agents",          color: "var(--orange)" },
  { tier: "STANDARD",     ttft: "800ms",  penalty: "1Г— fee",     use: "RAG apps, copilots",              color: "var(--text-primary)" },
  { tier: "BATCH",        ttft: "5s",     penalty: "0.25Г— fee",  use: "Summarization, embeddings",       color: "var(--text-secondary)" },
  { tier: "CONFIDENTIAL", ttft: "800ms",  penalty: "1Г— + slash", use: "Enterprise / private prompts",    color: "var(--purple)" },
];

const competitors = [
  { feature: "Enforceable latency SLA",      render: false, io: false, akash: false, stratum: false },
  { feature: "Penalty auto-payout",          render: false, io: false, akash: false, stratum: false },
  { feature: "Disaggregated Prefill/Decode", render: false, io: false, akash: false, stratum: false },
  { feature: "KV-cache routing",             render: false, io: false, akash: false, stratum: "partial" },
  { feature: "Confidential TEE serving",     render: false, io: false, akash: false, stratum: false },
  { feature: "Goodput optimization",         render: false, io: false, akash: false, stratum: "partial" },
];

function CellVal({ v }: { v: boolean | string }) {
  if (v === true)      return <span style={{ color: "var(--orange)",  fontWeight: 800, fontSize: 13 }}>YES</span>;
  if (v === "partial") return <span style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: 13 }}>PART</span>;
  return <span style={{ color: "var(--bg-4)", fontWeight: 600, fontSize: 13 }}>вЂ”</span>;
}

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

export default function LandingPage() {
  const [stats, setStats] = useState<NetworkStats>(getNetworkStats());
  const [role, setRole] = useState<Role>("customer");

  useEffect(() => {
    const id = setInterval(() => setStats(getNetworkStats()), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      {/* ── Role Switcher ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 900, letterSpacing: "2px", marginBottom: 20 }}>WHO ARE YOU?</div>
          <div style={{ display: "inline-flex", gap: 0, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
            {(["customer", "worker"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  padding: "12px 36px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 800, letterSpacing: "0.3px",
                  background: role === r ? (r === "worker" ? "var(--green)" : "var(--orange)") : "transparent",
                  color: role === r ? "#000" : "var(--text-muted)",
                  transition: "all 0.2s",
                }}
              >
                {r === "customer" ? "I Need AI" : "I Have a GPU"}
              </button>
            ))}
          </div>
        </div>

        {/* Role description chips */}
        <div style={{ textAlign: "center", marginBottom: 0 }}>
          <AnimatePresence mode="wait">
            <motion.p key={role} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 700, maxWidth: 520, margin: "12px auto 0" }}>
              {role === "customer"
                ? "Use AI with a speed guarantee. If the response is late, you get paid back automatically вЂ” no complaints, no forms."
                : "Plug in your GPU, run the worker software, and earn $LOCK tokens for every AI request you process on time."}
            </motion.p>
          </AnimatePresence>
        </div>
      </section>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "52px 24px 72px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <AnimatePresence mode="wait">
              <motion.div key={role} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {role === "customer" ? (
                  <>
                    <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.05, marginBottom: 22, letterSpacing: "-1.5px" }}>
                      AI that pays you back<br />if it&apos;s <span className="gradient-text">too slow</span>
                    </h1>
                    <p style={{ fontSize: 16, color: "var(--text-secondary)", fontWeight: 700, lineHeight: 1.8, marginBottom: 36, maxWidth: 480 }}>
                      Pick a speed tier. If the AI responds too slowly, money is automatically sent from the worker&apos;s wallet to yours вЂ” no waiting, no dispute, no customer support.
                    </p>
                    <div style={{ display: "flex", gap: 12 }}>
                      <Link href="/console" className="btn btn-primary" style={{ fontSize: 14 }}>Start Using AI в†’</Link>
                      <Link href="/docs" className="btn btn-ghost" style={{ fontSize: 14 }}>Read the Docs</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.05, marginBottom: 22, letterSpacing: "-1.5px" }}>
                      Your GPU earns<br /><span style={{ color: "var(--green)" }}>$LOCK</span> while it runs AI
                    </h1>
                    <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 36, maxWidth: 480 }}>
                      Install the worker software, point it at your GPU, stake some $LOCK as collateral, and start earning per request. Hit your SLA targets and your stake grows вЂ” miss them and a small penalty is auto-deducted.
                    </p>
                    <div style={{ display: "flex", gap: 12 }}>
                      <Link href="/worker" className="btn" style={{ fontSize: 14, background: "var(--green)", color: "#000", border: "none", padding: "10px 24px", borderRadius: 6, fontWeight: 800 }}>Open Worker Dashboard</Link>
                      <Link href="/docs#workers" className="btn btn-ghost" style={{ fontSize: 14 }}>Setup Guide</Link>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Right вЂ” stat cards */}
          <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "SLA PASS RATE",  to: stats.slaPassRate,        suffix: "%",     decimals: 1, accent: true },
              { label: "P99 TTFT",       to: stats.p99TtftMs,          suffix: "ms",    decimals: 0, accent: false },
              { label: "PENALTIES PAID", to: stats.totalPenaltiesPaid, suffix: " $LOCK", decimals: 0, accent: true },
              { label: "ACTIVE WORKERS", to: stats.activeworkers,      suffix: "",      decimals: 0, accent: false },
            ].map((c) => (
              <motion.div key={c.label} variants={fadeUp} transition={{ duration: 0.5 }}
                style={{ background: "var(--bg-2)", border: c.accent ? "1px solid var(--orange-border)" : "1px solid var(--border)", borderRadius: 8, padding: "20px" }}>
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

      {/* ── Plain English Explainer ────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-1)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1.5px", marginBottom: 14 }}>IN PLAIN ENGLISH</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 16 }}>What is Gridlock, really?</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 620, margin: "0 auto", lineHeight: 1.8 }}>
              Think of it like <strong style={{ color: "var(--text-primary)" }}>Uber for AI compute</strong> вЂ” but the car has a guaranteed arrival time, and if it&apos;s late, you automatically get a refund.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 48 }}>
            {[
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
                title: "Anyone can be a worker",
                body: "Have a gaming PC with a strong GPU? You can earn money by running AI on it. You install software, register on Gridlock, and your computer starts processing AI requests from people around the world.",
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                title: "Speed is guaranteed by code",
                body: "When you request AI, you pick a speed tier. The worker's $LOCK tokens are locked as collateral. If the AI is too slow, the blockchain automatically moves tokens from the worker's wallet to yours. No humans involved.",
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                title: "No one controls it",
                body: "Everything runs on Solana вЂ” a public blockchain. There is no company in the middle that can raise prices, cut you off, or disappear. The rules are written in code that anyone can read.",
              },
            ].map((c) => (
              <motion.div key={c.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "28px" }}>
                <div style={{ marginBottom: 16, color: "var(--text-primary)" }}>{c.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>{c.body}</div>
              </motion.div>
            ))}
          </div>

          {/* Simple flow diagram */}
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 24 }}>HOW A REQUEST FLOWS</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap", rowGap: 12 }}>
              {[
                { label: "You send a prompt", sub: "via API or Console", color: "var(--text-primary)" },
                null,
                { label: "Router picks a worker", sub: "best GPU for your tier", color: "var(--orange)" },
                null,
                { label: "Worker runs the AI", sub: "on their GPU", color: "var(--green)" },
                null,
                { label: "Response + proof", sub: "delivered to you", color: "var(--text-primary)" },
                null,
                { label: "Penalty or payment", sub: "settled automatically", color: "var(--orange)" },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} style={{ color: "var(--border-2)", fontSize: 18, padding: "0 8px" }}>в†’</div>
                ) : (
                  <div key={i} style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", minWidth: 130 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Role-specific content ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {role === "customer" ? (
          <motion.div key="customer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>

            {/* Code snippet */}
            <section style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>FOR DEVELOPERS</div>
                  <h2 style={{ fontSize: 30, fontWeight: 800, marginBottom: 16, letterSpacing: "-0.5px" }}>One URL change. Guaranteed latency.</h2>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28, fontSize: 15 }}>
                    Gridlock is a drop-in replacement for the OpenAI API. If the request misses your SLA target, the penalty is auto-credited on-chain вЂ” no dispute, no claim, no waiting.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { step: "1", text: "Point your SDK at api.gridlock.xyz" },
                      { step: "2", text: "Add sla: 'realtime' to your request" },
                      { step: "3", text: "Get paid back if it's late" },
                    ].map((s) => (
                      <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "var(--orange)", flexShrink: 0 }}>{s.step}</div>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <CodeBlock lines={[
                  { text: "// Change one URL, get a latency guarantee", dim: true },
                  { text: "import OpenAI from 'openai'" },
                  { text: "" },
                  { text: "const client = new OpenAI({" },
                  { text: "  baseURL: 'https://api.gridlock.xyz/v1',", indent: 1 },
                  { text: "  apiKey: process.env.GRIDLOCK_KEY,", indent: 1 },
                  { text: "})" },
                  { text: "" },
                  { text: "const res = await client.chat.completions.create({" },
                  { text: "  model: 'llama-3.1-70b',", indent: 1 },
                  { text: "  messages: [{ role: 'user', content: '...' }],", indent: 1 },
                  { text: "  gridlock: { sla: 'realtime' },", indent: 1 },
                  { text: "})" },
                  { text: "" },
                  { text: "// { ttftMs: 187, slaMet: true }", dim: true },
                ]} />
              </div>
            </section>

            {/* SLA tiers */}
            <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
              <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
                <div style={{ textAlign: "center", marginBottom: 48 }}>
                  <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, letterSpacing: "1.5px", marginBottom: 14 }}>SPEED TIERS</div>
                  <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Pick how fast you need it</h2>
                  <p style={{ color: "var(--text-secondary)", marginTop: 12, fontSize: 14 }}>Miss the target вЂ” penalty auto-pays from worker stake directly to your wallet.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {slaTiers.map((t, i) => (
                    <motion.div key={t.tier} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.45 }}
                      style={{ background: "var(--bg-2)", border: i === 0 ? "1px solid var(--orange-border)" : "1px solid var(--border)", borderRadius: 8, padding: "24px" }}>
                      <div style={{ fontSize: 10, color: t.color, fontWeight: 800, letterSpacing: "1.5px", marginBottom: 14 }}>{t.tier}</div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: t.color, marginBottom: 6, letterSpacing: "-0.5px" }}>{t.ttft}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 18 }}>first response target</div>
                      <div style={{ height: 1, background: "var(--border)", marginBottom: 16 }} />
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                        <span style={{ color: "var(--red)", fontWeight: 700 }}>Penalty if late:</span>{"  "}{t.penalty}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.use}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>

          </motion.div>
        ) : (

          /* ── WORKER PATH ─────────────────────────────────────────────────── */
          <motion.div key="worker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>

            {/* How it works for workers */}
            <section style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }}>
                <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, letterSpacing: "1.5px", marginBottom: 14 }}>FOR WORKERS</div>
                <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Set up in 4 steps</h2>
                <p style={{ color: "var(--text-secondary)", marginTop: 12, fontSize: 14 }}>You need a Solana wallet, a strong GPU, and about 15 minutes.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 48 }}>
                {[
                  { n: "01", title: "Install vLLM",         color: "var(--green)",  desc: "vLLM is the open-source software that actually runs the AI model on your GPU. It's what turns your hardware into an inference server." },
                  { n: "02", title: "Install Gridlock Worker", color: "var(--green)", desc: "The Gridlock worker agent connects your vLLM server to the network. It handles job routing, SLA tracking, heartbeats, and payments." },
                  { n: "03", title: "Stake $LOCK tokens",    color: "var(--orange)", desc: "Stake $LOCK as collateral to signal you're serious. The more you stake, the more earnings multiplier you get. Minimum 1,000 $LOCK for Batch tier." },
                  { n: "04", title: "Start earning",        color: "var(--orange)", desc: "Your worker goes live. Requests come in automatically. Hit your SLA target every time and your reliability score climbs вЂ” unlocking better-paying tiers." },
                ].map((s, i) => (
                  <motion.div key={s.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: s.color, marginBottom: 10, letterSpacing: "1px" }}>{s.n}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{s.desc}</div>
                  </motion.div>
                ))}
              </div>

              {/* Setup commands */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>STEP 1 + 2 вЂ” INSTALL</div>
                  <CodeBlock lines={[
                    { text: "# Install vLLM (requires CUDA GPU)", dim: true },
                    { text: "pip install vllm" },
                    { text: "" },
                    { text: "# Install the Gridlock worker agent", dim: true },
                    { text: "pip install gridlock-worker" },
                    { text: "" },
                    { text: "# Start your inference server", dim: true },
                    { text: "vllm serve meta-llama/Llama-3.1-8B \\" },
                    { text: "  --port 8000 --tensor-parallel-size 1", indent: 1 },
                  ]} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>STEP 3 + 4 вЂ” REGISTER & START</div>
                  <CodeBlock lines={[
                    { text: "# Register your worker on-chain", dim: true },
                    { text: "gridlock-worker register \\" },
                    { text: "  --wallet ~/.config/solana/id.json \\", indent: 1 },
                    { text: "  --endpoint http://localhost:8000 \\", indent: 1 },
                    { text: "  --role Prefill \\", indent: 1 },
                    { text: "  --hardware H100", indent: 1 },
                    { text: "" },
                    { text: "# Go live вЂ” jobs start arriving automatically", dim: true },
                    { text: "gridlock-worker start" },
                  ]} />
                </div>
              </div>
            </section>

            {/* Hardware requirements + earnings */}
            <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
              <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>

                  {/* Hardware table */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 20 }}>HARDWARE REQUIREMENTS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { gpu: "NVIDIA RTX 4090",  tier: "Batch + Standard",           stake: "1K $LOCK",  earnings: "~12 $LOCK/day",  status: "ok" },
                        { gpu: "NVIDIA RTX 3090",  tier: "Batch",                       stake: "1K $LOCK",  earnings: "~6 $LOCK/day",   status: "ok" },
                        { gpu: "NVIDIA A100",      tier: "Batch + Standard + Realtime", stake: "15K $LOCK", earnings: "~80 $LOCK/day",  status: "ok" },
                        { gpu: "NVIDIA H100",      tier: "All tiers + Confidential",    stake: "20K $LOCK", earnings: "~200 $LOCK/day", status: "tee" },
                        { gpu: "AMD RX 7900 XTX",  tier: "Batch only (ROCm)",           stake: "1K $LOCK",  earnings: "~4 $LOCK/day",   status: "ok" },
                      ].map((r) => (
                        <div key={r.gpu} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{r.gpu}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.tier}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>{r.earnings}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.stake} stake req.</div>
                          </div>
                          {r.status === "tee" && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--purple)", background: "rgba(180,100,255,0.1)", border: "1px solid rgba(180,100,255,0.2)", borderRadius: 4, padding: "2px 6px" }}>TEE</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                      Earnings depend on network demand, SLA tier, and reliability score. Estimates at current network utilization.
                    </div>
                  </div>

                  {/* Earnings breakdown */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 20 }}>HOW WORKERS EARN</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: "Per-request fees",      desc: "Customers pay in $LOCK for every completed request. Higher SLA tiers pay more. Hit your target time and you keep 20% of the network fee." },
                        { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, title: "Reliability bonus",     desc: "Your reliability score (0вЂ“10,000) determines job priority. Score above 9,500 unlocks Realtime tier вЂ” the highest-paying tier." },
                        { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, title: "Staking multiplier",    desc: "Stake 15K+ $LOCK в†’ 2Г— earnings multiplier. Stake 50K+ $LOCK в†’ 3Г— multiplier. Your stake also earns 8% APY on its own." },
                        { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: "Confidential premium",  desc: "H100 workers with TEE mode enabled earn a premium on top of standard fees for encrypting prompts inside the secure hardware enclave." },
                      ].map((item) => (
                        <div key={item.title} style={{ display: "flex", gap: 14, padding: "16px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                          <div style={{ flexShrink: 0, color: "var(--text-primary)", marginTop: 2 }}>{item.icon}</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Comparison table (always visible) ────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: role === "worker" ? "var(--bg-0)" : "var(--bg-1)" }}>
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
                    <th key={h} style={{ textAlign: i === 0 ? "left" : "center", color: i === 5 ? "var(--orange)" : undefined, fontWeight: i === 5 ? 800 : undefined, fontSize: 11, letterSpacing: "0.5px" }}>{h}</th>
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
      <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }}
        style={{ maxWidth: 1280, margin: "0 auto", padding: "88px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 16, letterSpacing: "-1px" }}>
          Ready to {role === "customer" ? "build" : "earn"}?
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 40, maxWidth: 520, margin: "0 auto 40px" }}>
          {role === "customer"
            ? "Change one URL. Add one field. Get a latency guarantee backed by real money."
            : "Install two packages. Register in 60 seconds. Your GPU earns $LOCK around the clock."}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
          {role === "customer" ? (
            <>
              <Link href="/console" className="btn btn-primary" style={{ padding: "14px 36px", fontSize: 15 }}>Open SLA Console</Link>
              <Link href="/docs" className="btn btn-ghost" style={{ padding: "14px 36px", fontSize: 15 }}>Read the Docs</Link>
            </>
          ) : (
            <>
              <Link href="/worker" className="btn" style={{ padding: "14px 36px", fontSize: 15, background: "var(--green)", color: "#000", border: "none", borderRadius: 6, fontWeight: 800 }}>Worker Dashboard</Link>
              <Link href="/stake" className="btn btn-ghost" style={{ padding: "14px 36px", fontSize: 15 }}>Stake $LOCK</Link>
            </>
          )}
        </div>
        <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-muted)" }}>
          {role === "customer" ? "Penalties are automatic. No trust required." : "Pausing is free. You keep your stake."}
        </p>
      </motion.section>
    </div>
  );
}
