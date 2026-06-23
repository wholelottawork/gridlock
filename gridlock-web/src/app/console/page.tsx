"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { generateJobs, type Job, type SlaTier } from "@/lib/mock-data";
import { ChartWrapper } from "@/components/chart-wrapper";
import {
  chatCompletion,
  fetchNetworkStats,
  fetchJobs,
  fetchTeeCapacity,
  type ApiJob,
  type ApiNetworkStats,
  type ApiTeeCapacity,
  type ChatGridlockMeta,
} from "@/lib/api-client";
import {
  buildChatMessages,
  clearStoredConsoleChat,
  loadStoredConsoleChat,
  saveStoredConsoleChat,
} from "@/lib/conversation";

type Tab = "playground" | "overview" | "monitor" | "penalties" | "keys" | "billing" | "privacy";

const MODELS = [
  { value: "llama-3.1-8b-instant",     label: "LLaMA 3.1 8B  (fast)" },
  { value: "llama-3.1-70b-versatile",  label: "LLaMA 3.1 70B (powerful)" },
  { value: "mixtral-8x7b-32768",       label: "Mixtral 8x7B" },
];

const SLA_TIERS: { id: SlaTier; label: string; ttft: string; tpot: number; penalty: string }[] = [
  { id: "realtime",     label: "Realtime",     ttft: "< 300ms",      tpot: 60,   penalty: "2× fee" },
  { id: "standard",     label: "Standard",     ttft: "< 800ms",      tpot: 120,  penalty: "1× fee" },
  { id: "batch",        label: "Batch",        ttft: "< 5s",         tpot: 9999, penalty: "0.25× fee" },
  { id: "confidential", label: "Confidential", ttft: "< 800ms + TEE", tpot: 120, penalty: "1× + slash" },
];

interface PlayMessage {
  prompt: string;
  content: string;
  meta: ChatGridlockMeta;
}

function SlaTag({ tier }: { tier: SlaTier }) {
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 3,
      background: "var(--bg-4)", border: "1px solid var(--border-2)",
      color: "var(--text-secondary)", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
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
  const [tab, setTab] = useState<Tab>("playground");

  // ── Playground state ─────────────────────────────────────────────────────
  const [playModel, setPlayModel]     = useState(MODELS[0].value);
  const [playSla, setPlaySla]         = useState<SlaTier>("standard");
  const [playPrivacy, setPlayPrivacy] = useState(false);
  const [playInput, setPlayInput]     = useState("");
  const [playLoading, setPlayLoading] = useState(false);
  const [playElapsed, setPlayElapsed] = useState(0);
  const [playMessages, setPlayMessages] = useState<PlayMessage[]>([]);
  const [playError, setPlayError]     = useState<string | null>(null);
  const [chatHydrated, setChatHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = loadStoredConsoleChat();
    if (stored.playMessages?.length) setPlayMessages(stored.playMessages as PlayMessage[]);
    if (stored.playModel) setPlayModel(stored.playModel);
    if (stored.playSla) setPlaySla(stored.playSla as SlaTier);
    setChatHydrated(true);
  }, []);

  useEffect(() => {
    if (!chatHydrated) return;
    saveStoredConsoleChat({ playModel, playSla, playMessages });
  }, [chatHydrated, playModel, playSla, playMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [playMessages, playLoading]);

  useEffect(() => {
    if (playSla === "confidential") setPlayPrivacy(true);
  }, [playSla]);

  async function sendPrompt() {
    if (playPrivacy && teeCapacity && !teeCapacity.can_serve_confidential) {
      setPlayError("No TEE workers online — start a worker with GRIDLOCK_TEE_CAPABLE=true or disable privacy.");
      return;
    }
    const prompt = playInput.trim();
    if (!prompt || playLoading) return;
    setPlayInput("");
    setPlayLoading(true);
    setPlayError(null);
    setPlayElapsed(0);
    const start = Date.now();
    timerRef.current = setInterval(() => setPlayElapsed(Date.now() - start), 50);
    try {
      const { content, meta } = await chatCompletion({
        model: playModel,
        messages: buildChatMessages(
          playMessages.map((m) => ({ user: m.prompt, assistant: m.content })),
          prompt,
        ),
        sla: playSla,
        privacy: playPrivacy,
      });
      setPlayMessages((prev) => [...prev, { prompt, content, meta }]);
    } catch (e: unknown) {
      setPlayError(e instanceof Error ? e.message : "Backend unreachable — is the server running on port 8080?");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setPlayLoading(false);
    }
  }

  function clearChat() {
    setPlayMessages([]);
    setPlayInput("");
    setPlayError(null);
    clearStoredConsoleChat();
  }

  // ── Overview / real stats ─────────────────────────────────────────────────
  const [realStats, setRealStats] = useState<ApiNetworkStats | null>(null);
  const [teeCapacity, setTeeCapacity] = useState<ApiTeeCapacity | null>(null);
  const [selectedTier, setSelectedTier] = useState<SlaTier>("realtime");
  const [privacyDefault, setPrivacyDefault] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<{ t: number; p99: number; p50: number }[]>([]);

  useEffect(() => {
    setLatencyHistory(
      Array.from({ length: 20 }, (_, i) => ({ t: i, p99: Math.floor(Math.random() * 200 + 120), p50: Math.floor(Math.random() * 100 + 80) }))
    );
    const load = () => {
      fetchNetworkStats().then(setRealStats).catch(() => {});
      fetchTeeCapacity().then(setTeeCapacity).catch(() => {});
    };
    load();
    const id = setInterval(() => {
      load();
      setLatencyHistory((prev) => [
        ...prev.slice(1),
        { t: Date.now(), p99: Math.floor(Math.random() * 200 + 120), p50: Math.floor(Math.random() * 100 + 80) },
      ]);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const passRate     = realStats?.sla_pass_rate ?? 0;
  const p99Ttft      = realStats?.p99_ttft_ms ?? 0;
  const totalPenalty = realStats?.total_penalties_lock ?? 0;
  const confShare    = realStats?.confidential_share ?? 0;

  // ── Monitor / real jobs ───────────────────────────────────────────────────
  const [realJobs, setRealJobs]         = useState<ApiJob[] | null>(null);
  const [mockJobs, setMockJobs]         = useState<Job[]>([]);
  const [mockPenalties, setMockPenalties] = useState<Job[]>([]);

  useEffect(() => {
    const allJobs = generateJobs(50);
    setMockJobs(allJobs);
    setMockPenalties(allJobs.filter((j) => !j.slaMet && j.penaltyPaid));
  }, []);

  useEffect(() => {
    const load = () => fetchJobs({ limit: 50 }).then((r) => setRealJobs(r.jobs)).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  // combine: real jobs for monitor + penalties derived from them
  const displayJobs = realJobs ?? [];
  const displayPenalties = displayJobs.filter((j) => !j.sla_met && j.penalty_paid);
  const totalPenaltyCredited = displayPenalties.reduce((s, j) => s + (j.penalty_paid ?? 0), 0);

  const selectStyle: React.CSSProperties = {
    background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6,
    padding: "7px 12px", fontSize: 13, color: "var(--text-primary)", outline: "none",
    cursor: "pointer", width: "100%",
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>SLA Console</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
          {realStats ? `${realStats.active_workers} active workers · ${realStats.jobs_total} jobs tracked · ${realStats.sla_pass_rate}% SLA pass rate` : "Monitor inference SLA in real time. Penalties auto-credited on miss."}
        </p>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {([
          ["playground", "Playground"],
          ["overview",   "Overview"],
          ["monitor",    "Monitor"],
          ["penalties",  "Penalties"],
          ["keys",       "API Keys"],
          ["billing",    "Billing"],
          ["privacy",    "Privacy"],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn${tab === t ? " active" : ""}`}>{l}</button>
        ))}
      </div>

      {/* ── PLAYGROUND ───────────────────────────────────────────────────────── */}
      {tab === "playground" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Config */}
          <div className="card" style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 7 }}>MODEL</div>
              <select value={playModel} onChange={(e) => setPlayModel(e.target.value)} style={selectStyle}>
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div style={{ flex: "1 1 300px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 7 }}>SLA TIER</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SLA_TIERS.map((t) => (
                  <button key={t.id} onClick={() => setPlaySla(t.id)} style={{
                    padding: "6px 13px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    border: playSla === t.id ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                    background: playSla === t.id ? "var(--orange-dim)" : "var(--bg-3)",
                    color: playSla === t.id ? "var(--orange)" : "var(--text-muted)",
                    transition: "all 0.12s",
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flexShrink: 0, width: 226 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 7 }}>TEE / PRIVACY</div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, paddingRight: 150, minHeight: 22 }}>
                <div className={`toggle${playPrivacy ? " on" : ""}`} onClick={() => setPlayPrivacy((p) => !p)}>
                  <div className="toggle-thumb" />
                </div>
                <span style={{ fontSize: 12, color: playPrivacy ? "var(--orange)" : "var(--text-muted)", fontWeight: 600 }}>
                  {playPrivacy ? "On" : "Off"}
                </span>
                <span style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 142,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  visibility: playPrivacy ? "visible" : "hidden",
                  color: teeCapacity?.can_serve_confidential ? "var(--green)" : "var(--red)",
                }}>
                  {teeCapacity
                    ? teeCapacity.can_serve_confidential
                      ? `${teeCapacity.tee_workers_online} TEE worker(s) online`
                      : "No TEE workers online"
                    : "Checking TEE capacity…"}
                </span>
              </div>
            </div>

            {playMessages.length > 0 && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 7 }}>CHAT</div>
                <button
                  type="button"
                  onClick={clearChat}
                  style={{
                    padding: "6px 13px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-muted)",
                  }}
                >
                  New chat
                </button>
              </div>
            )}
          </div>

          {/* Chat area */}
          <div className="card" style={{ minHeight: 340, display: "flex", flexDirection: "column", gap: 20 }}>
            {playMessages.length === 0 && !playLoading && !playError && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "var(--orange)", letterSpacing: "-1px" }}>G</div>
                <div style={{ fontSize: 13 }}>Ask anything — your first token is timed against the SLA target</div>
                <div style={{ fontSize: 11, color: "var(--border-2)" }}>
                  {SLA_TIERS.find((t) => t.id === playSla)?.ttft} target · {SLA_TIERS.find((t) => t.id === playSla)?.penalty} penalty on miss
                </div>
              </div>
            )}

            {playMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* User bubble */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{
                    background: "var(--bg-4)", borderRadius: "10px 10px 2px 10px",
                    padding: "10px 14px", maxWidth: "72%", fontSize: 13,
                    color: "var(--text-primary)", lineHeight: 1.6,
                  }}>
                    {msg.prompt}
                  </div>
                </div>

                {/* Assistant bubble */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    width: 26, height: 26, background: "var(--orange)", borderRadius: 5, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900, color: "#000",
                  }}>G</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      background: "var(--bg-3)", borderRadius: "2px 10px 10px 10px",
                      padding: "10px 14px", fontSize: 13, color: "var(--text-primary)",
                      lineHeight: 1.7, marginBottom: 8, whiteSpace: "pre-wrap",
                    }}>
                      {msg.content}
                    </div>
                    {/* SLA badge row */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 800,
                        background: msg.meta.sla_met ? "rgba(0,220,100,0.08)" : "rgba(255,60,60,0.08)",
                        color: msg.meta.sla_met ? "var(--green)" : "var(--red)",
                        border: `1px solid ${msg.meta.sla_met ? "rgba(0,220,100,0.2)" : "rgba(255,60,60,0.2)"}`,
                      }}>
                        {msg.meta.sla_met ? "✓ SLA MET" : "✗ SLA MISS"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                        TTFT {msg.meta.ttft_ms}ms
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        target &lt;{msg.meta.sla_target_ttft_ms}ms
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                        TPOT {msg.meta.tpot_ms}ms
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        target &lt;{SLA_TIERS.find((t) => t.id === msg.meta.sla_tier)?.tpot ?? 120}ms
                      </span>
                      {msg.meta.penalty_due_lock ? (
                        <span style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700 }}>
                          +{msg.meta.penalty_due_lock.toFixed(4)} $LOCK credited
                        </span>
                      ) : null}
                      {msg.meta.confidential && msg.meta.attestation_hash && (
                        <span style={{ fontSize: 11, color: "var(--purple)", fontFamily: "monospace", fontWeight: 600 }}>
                          attestation {msg.meta.attestation_hash.slice(0, 8)}…
                        </span>
                      )}
                      {msg.meta.confidential && !msg.meta.attestation_hash && (
                        <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                          attestation missing
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        worker {msg.meta.worker.slice(0, 8)}…
                      </span>
                      <span style={{ fontSize: 10, color: "var(--border-2)", fontFamily: "monospace" }}>
                        {msg.meta.job_id.slice(0, 12)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {playLoading && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{
                  width: 26, height: 26, background: "var(--orange)", borderRadius: 5, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: "#000",
                }}>G</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Waiting for first token…{" "}
                  <span style={{ fontFamily: "monospace", color: "var(--orange)", fontWeight: 700 }}>
                    {playElapsed}ms
                  </span>
                </div>
              </div>
            )}

            {playError && (
              <div style={{
                padding: "12px 16px", borderRadius: 6, fontSize: 12,
                background: "rgba(255,60,60,0.06)", border: "1px solid rgba(255,60,60,0.2)",
                color: "var(--red)",
              }}>
                {playError}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              value={playInput}
              onChange={(e) => setPlayInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }}
              placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
              rows={2}
              style={{
                flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6,
                padding: "10px 14px", fontSize: 13, color: "var(--text-primary)", resize: "none",
                fontFamily: "inherit", outline: "none", minHeight: 48, maxHeight: 160,
                lineHeight: 1.6,
              }}
            />
            <button
              onClick={sendPrompt}
              disabled={playLoading || !playInput.trim()}
              className="btn btn-primary"
              style={{ flexShrink: 0, height: 48, padding: "0 28px", fontSize: 13 }}
            >
              {playLoading ? "…" : "Send →"}
            </button>
          </div>
        </div>
      )}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "SLA PASS RATE",      value: realStats ? `${realStats.sla_pass_rate}%`                    : "…", accent: passRate >= 99 ? "var(--green)" : passRate >= 96 ? "var(--yellow)" : "var(--red)" },
              { label: "P99 TTFT",           value: realStats ? `${realStats.p99_ttft_ms}ms`                    : "…", accent: "var(--text-primary)" },
              { label: "PENALTIES CREDITED", value: realStats ? `${realStats.total_penalties_lock.toFixed(4)} $LOCK` : "…", accent: "var(--orange)" },
              { label: "CONFIDENTIAL",       value: realStats ? `${realStats.confidential_share}%`              : "…", accent: "var(--text-primary)" },
            ].map((s) => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.accent, letterSpacing: "-0.5px" }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>P99 TTFT — LAST 20 INTERVALS</div>
            <ChartWrapper height={150}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyHistory}>
                  <XAxis hide /><YAxis hide domain={[0, 800]} />
                  <Tooltip contentStyle={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} labelStyle={{ display: "none" }} />
                  <ReferenceLine y={300} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 2" strokeWidth={2} />
                  <Line type="monotone" dataKey="p99" stroke="#ffffff" dot={false} strokeWidth={2.5} />
                  <Line type="monotone" dataKey="p50" stroke="rgba(255,255,255,0.55)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartWrapper>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 700 }}>— p99</span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>— p50</span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>- - SLA limit</span>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>SLA SETTINGS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 10 }}>Default SLA Tier</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SLA_TIERS.map((t) => (
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
                      <div style={{ fontSize: 13, fontWeight: 700, color: privacyDefault ? "var(--orange)" : "var(--text-primary)" }}>Privacy by Default</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>Route to TEE-capable workers only</div>
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

          {realStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "ACTIVE WORKERS",  value: realStats.active_workers },
                { label: "JOBS TODAY",      value: realStats.requests_today },
                { label: "JOBS TOTAL",      value: realStats.jobs_total },
              ].map((s) => (
                <div key={s.label} className="card">
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text-primary)" }}>{s.value.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MONITOR ──────────────────────────────────────────────────────────── */}
      {tab === "monitor" && (
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 900, letterSpacing: "1px", marginBottom: 14 }}>
            LIVE REQUEST STREAM — {realJobs ? `${realJobs.length}` : `${mockJobs.length} simulated`}
          </div>
          <div style={{ overflowX: "auto" }}>
            {realJobs && realJobs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>{["Time", "Job ID", "Model", "Tier", "Worker", "TTFT", "SLA", "Status"].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {realJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{new Date(j.ts * 1000).toLocaleTimeString()}</td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.id.slice(0, 12)}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model}</td>
                      <td><SlaTag tier={j.sla_tier} /></td>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.worker}…</td>
                      <td style={{ color: j.ttft_ms > (j.sla_tier === "realtime" ? 300 : 800) ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{j.ttft_ms}ms</td>
                      <td><SlaResult met={j.sla_met} /></td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{j.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : realJobs && realJobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>No jobs yet</div>
                <div style={{ fontSize: 12 }}>Send a prompt in the Playground tab to create the first job</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>{["Time", "Job ID", "Model", "Tier", "Worker", "TTFT", "TPOT", "SLA"].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {mockJobs.map((j) => (
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
            )}
          </div>
        </div>
      )}

      {/* ── PENALTIES ────────────────────────────────────────────────────────── */}
      {tab === "penalties" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="card card-orange">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>TOTAL CREDITED</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--orange)" }}>
                {realStats ? realStats.total_penalties_lock.toFixed(4) : totalPenaltyCredited.toFixed(4)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>$LOCK auto-credited</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>MISSES</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--red)" }}>
                {realJobs ? displayPenalties.length : mockPenalties.length}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>SLA misses tracked</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>HOW IT WORKS</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, fontWeight: 700 }}>
                Penalties transfer directly from worker staked $LOCK to your wallet via PermanentDelegate — no dispute needed.
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>PENALTY LOG</div>
            {(realJobs ? displayPenalties : mockPenalties).length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700 }}>ALL CLEAR</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>All requests met SLA</div>
              </div>
            ) : realJobs ? (
              <table className="data-table">
                <thead><tr>{["Time", "Job ID", "Tier", "TTFT", "Penalty"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {displayPenalties.map((j) => (
                    <tr key={j.id}>
                      <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{new Date(j.ts * 1000).toLocaleTimeString()}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{j.id.slice(0, 14)}</td>
                      <td><SlaTag tier={j.sla_tier} /></td>
                      <td style={{ color: "var(--red)", fontWeight: 700 }}>{j.ttft_ms}ms</td>
                      <td style={{ color: "var(--orange)", fontWeight: 700 }}>+{j.penalty_paid?.toFixed(4)} $LOCK</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead><tr>{["Time", "Job ID", "Tier", "TTFT", "Limit", "Penalty", "Tx"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {mockPenalties.map((j) => {
                    const limit = j.slaTier === "realtime" ? 300 : j.slaTier === "batch" ? 5000 : 800;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{new Date(j.ts).toLocaleTimeString()}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{j.id.slice(0, 14)}</td>
                        <td><SlaTag tier={j.slaTier} /></td>
                        <td style={{ color: "var(--red)", fontWeight: 700 }}>{j.ttftMs}ms</td>
                        <td style={{ color: "var(--text-muted)" }}>{limit}ms</td>
                        <td style={{ color: "var(--orange)", fontWeight: 700 }}>+{j.penaltyPaid?.toFixed(4)} $LOCK</td>
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

      {/* ── PRIVACY ──────────────────────────────────────────────────────────── */}
      {tab === "privacy" && (() => {
        const [teeOnly, setTeeOnly] = [playPrivacy, setPlayPrivacy];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* TEE header */}
            <div className="card card-orange">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>CONFIDENTIAL COMPUTING</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Privacy-Preserving Inference</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 480, lineHeight: 1.6, fontWeight: 700 }}>
                    Route all requests to TEE-capable workers (NVIDIA CC / AMD SEV). Your prompts are encrypted in hardware — the worker operator cannot read them.
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div className={`toggle${teeOnly ? " on" : ""}`}
                    style={{ transform: "scale(1.4)", background: teeOnly ? "var(--text-primary)" : undefined, borderColor: teeOnly ? "var(--text-primary)" : undefined }}
                    onClick={() => setTeeOnly((p: boolean) => !p)}>
                    <div className="toggle-thumb" />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: teeOnly ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {teeOnly ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
              </div>
            </div>

            {/* How TEE works */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { n: "01", title: "Hardware Enclave",  desc: "NVIDIA H100 Confidential Computing or AMD SEV-SNP isolates the inference process. Even the GPU owner cannot read the memory." },
                { n: "02", title: "Attestation Hash",  desc: "Every confidential job produces a signed attestation hash proving execution happened inside a TEE. Stored on-chain in the SLARegistry." },
                { n: "03", title: "Slash on Failure",  desc: "Workers who fail TEE attestation face an additional reputation slash on top of the standard SLA penalty." },
              ].map((c) => (
                <div key={c.n} className="card">
                  <div style={{ fontSize: 10, fontWeight: 900, color: "var(--text-muted)", marginBottom: 6 }}>{c.n}</div>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, fontWeight: 700 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            {/* TEE worker pool stats */}
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 900, letterSpacing: "1px", marginBottom: 14 }}>TEE WORKER POOL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "TEE WORKERS",      value: realStats ? realStats.tee_workers.toString()         : "—", accent: "var(--text-primary)" },
                  { label: "CONFIDENTIAL SHARE", value: realStats ? `${realStats.confidential_share}%`    : "—", accent: "var(--text-primary)" },
                  { label: "SLA TARGET",         value: "< 800ms + proof",                                  accent: "var(--text-secondary)" },
                  { label: "PENALTY",            value: "1× fee + slash",                                   accent: "var(--red)" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "var(--bg-3)", borderRadius: 6, padding: "14px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: s.accent }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supported hardware */}
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>SUPPORTED HARDWARE</div>
              <table className="data-table">
                <thead><tr>{["GPU", "TEE Mode", "Memory", "Status"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["NVIDIA H100 SXM", "Confidential Computing (CC)",    "80GB HBM3",  "Supported"],
                    ["NVIDIA H100 NVL", "Confidential Computing (CC)",    "94GB HBM3",  "Supported"],
                    ["NVIDIA H200",     "Confidential Computing (CC)",    "141GB HBM3e", "Supported"],
                    ["AMD MI300X",      "SEV-SNP",                        "192GB HBM3",  "Coming Q3 2025"],
                    ["NVIDIA A100",     "Not supported",                  "80GB HBM2e",  "Not available"],
                  ].map(([gpu, mode, mem, status]) => (
                    <tr key={gpu}>
                      <td style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{gpu}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{mode}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{mem}</td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, color: status === "Supported" ? "var(--green)" : status.startsWith("Coming") ? "var(--yellow)" : "var(--text-muted)" }}>
                          {status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {teeOnly && (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>
                <strong>TEE mode is active.</strong> All requests in the Playground tab will be routed to Confidential-tier workers with attestation hashes included in every response.
              </div>
            )}
          </div>
        );
      })()}

      {/* ── BILLING ──────────────────────────────────────────────────────────── */}
      {tab === "billing" && (() => {
        const usageByModel = [
          { model: "llama-3.1-8b-instant",    requests: 41_820, tokens: 18_293_400, spend: 36.59, pct: 87 },
          { model: "llama-3.1-70b-versatile", requests: 4_211,  tokens: 3_844_200,  spend: 30.75, pct: 10 },
          { model: "mixtral-8x7b-32768",      requests: 1_260,  tokens: 892_100,    spend: 1.78,  pct: 3 },
        ];
        const usageByTier = [
          { tier: "Realtime",     requests: 12_400, spend: 24.80, pct: 36, color: "var(--orange)" },
          { tier: "Standard",     requests: 28_891, spend: 28.89, pct: 52, color: "var(--green)" },
          { tier: "Batch",        requests: 4_700,  spend: 4.70,  pct: 9,  color: "var(--text-secondary)" },
          { tier: "Confidential", requests: 1_300,  spend: 10.73, pct: 3,  color: "var(--purple)" },
        ];
        const invoices = [
          { period: "May 2025",  amount: 69.12, status: "paid",    txId: "5xKm…r9Qw" },
          { period: "Apr 2025",  amount: 54.88, status: "paid",    txId: "3nPw…v4Tb" },
          { period: "Mar 2025",  amount: 31.44, status: "paid",    txId: "8qYv…k2Mn" },
        ];
        const totalSpend = usageByTier.reduce((s, t) => s + t.spend, 0);
        const totalRequests = usageByTier.reduce((s, t) => s + t.requests, 0);
        const totalTokens = usageByModel.reduce((s, m) => s + m.tokens, 0);
        const creditBalance = 150.00;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "MTD SPEND",       value: `${totalSpend.toFixed(2)} $LOCK`,           accent: "var(--orange)" },
                { label: "CREDIT BALANCE",  value: `${creditBalance.toFixed(2)} $LOCK`,        accent: "var(--green)" },
                { label: "REQUESTS (MTD)",  value: totalRequests.toLocaleString(),            accent: "var(--text-primary)" },
                { label: "TOKENS (MTD)",    value: `${(totalTokens / 1_000_000).toFixed(1)}M`, accent: "var(--text-secondary)" },
              ].map((s) => (
                <div key={s.label} className="card">
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.accent }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Usage by tier */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>SPEND BY SLA TIER</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {usageByTier.map((t) => (
                    <div key={t.tier}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.tier}</span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.spend.toFixed(2)} $LOCK · {t.requests.toLocaleString()} req</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${t.pct}%`, background: t.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>SPEND BY MODEL</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {usageByModel.map((m) => (
                    <div key={m.model}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)" }}>{m.model.split("-").slice(0, 3).join("-")}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{m.spend.toFixed(2)} $LOCK</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${m.pct}%`, background: "var(--orange)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>PRICING ($LOCK per 1M tokens)</div>
              <table className="data-table">
                <thead><tr>{["Model", "Batch", "Standard", "Realtime", "Confidential"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["llama-3.1-8b-instant",    "0.8",  "2.0",  "4.0",  "5.0"],
                    ["llama-3.1-70b-versatile", "3.2",  "8.0",  "16.0", "20.0"],
                    ["mixtral-8x7b-32768",      "0.8",  "2.0",  "4.0",  "5.0"],
                  ].map(([model, ...prices]) => (
                    <tr key={model}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{model}</td>
                      {prices.map((p, i) => (
                        <td key={i} style={{ color: "var(--orange)", fontWeight: 700 }}>{p} $LOCK</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invoice history */}
            <div className="card">
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>INVOICE HISTORY</div>
              <table className="data-table">
                <thead><tr>{["Period", "Amount", "Status", "On-Chain Tx"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.period}>
                      <td style={{ fontWeight: 600 }}>{inv.period}</td>
                      <td style={{ color: "var(--orange)", fontWeight: 700 }}>{inv.amount.toFixed(2)} $LOCK</td>
                      <td><span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", padding: "2px 7px", borderRadius: 3 }}>{inv.status.toUpperCase()}</span></td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{inv.txId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
                Payments are settled automatically each month. Fees are deducted from your credit balance in $LOCK.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── API KEYS ─────────────────────────────────────────────────────────── */}
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
              <button className="btn btn-primary" style={{ marginTop: 8, width: "fit-content", fontSize: 13 }}>Create New Key</button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>QUICKSTART</div>
            <div style={{ background: "var(--bg-0)", borderRadius: 6, padding: "16px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "var(--text-secondary)" }}>
              <div style={{ color: "var(--text-muted)" }}>npm install openai</div>
              <br />
              <div><span style={{ color: "#888" }}>import</span> OpenAI <span style={{ color: "#888" }}>from</span> <span style={{ color: "#aaa" }}>&apos;openai&apos;</span></div>
              <div><span style={{ color: "#888" }}>const</span> client = <span style={{ color: "#888" }}>new</span> <span style={{ color: "#fff" }}>OpenAI</span>{"({ baseURL: 'http://localhost:8080/v1', apiKey: 'any' })"}</div>
              <div><span style={{ color: "#888" }}>const</span> res = <span style={{ color: "#888" }}>await</span> client.chat.completions.<span style={{ color: "#fff" }}>create</span>{"({"}</div>
              <div style={{ paddingLeft: 16 }}>model: <span style={{ color: "#aaa" }}>&apos;llama-3.1-8b-instant&apos;</span>,</div>
              <div style={{ paddingLeft: 16 }}>messages: [{"{"} role: <span style={{ color: "#aaa" }}>&apos;user&apos;</span>, content: <span style={{ color: "#aaa" }}>&apos;Hello&apos;</span> {"}"}],</div>
              <div style={{ paddingLeft: 16 }}>gridlock: {"{"} sla: <span style={{ color: "#aaa" }}>&apos;realtime&apos;</span> {"}"}</div>
              <div>{"}"}</div>
              <br />
              <div style={{ color: "var(--text-muted)" }}>{"// res.gridlock = { ttft_ms: 187, sla_met: true, ... }"}</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
