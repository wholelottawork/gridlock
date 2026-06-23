"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ChartWrapper } from "@/components/chart-wrapper";
import {
  fetchWorker,
  fetchLeaderboard,
  subscribeLive,
  setWorkerStatus,
  setWorkerConfidentialMode,
  type ApiWorker,
  type ApiJob,
} from "@/lib/api-client";
import { fmt } from "@/lib/utils";
import { useBrowserWorker } from "@/context/browser-worker-context";

type WorkerState = "Active" | "Paused" | "Stopping";

type LatencyPoint = { t: string; ttft: number; tpot: number };

function jobsToLatency(jobs: ApiJob[]): LatencyPoint[] {
  if (!jobs.length) return [];
  return [...jobs].reverse().slice(-20).map((j, i) => ({
    t: String(i),
    ttft: j.ttft_ms,
    tpot: j.tpot_ms,
  }));
}

function dashNum(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function WorkerDashboard() {
  const { publicKey, connected } = useWallet();
  const browserWorker = useBrowserWorker();
  const [mounted, setMounted] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const [workerData, setWorkerData] = useState<(ApiWorker & { recent_jobs: ApiJob[] }) | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [notRegistered, setNotRegistered] = useState(false);
  const [networkRank, setNetworkRank] = useState<number | null>(null);

  const [status, setStatus] = useState<WorkerState>("Paused");
  const [confidential, setConfidential] = useState(false);
  const [latency, setLatency] = useState<LatencyPoint[]>([]);
  const stoppingRef = useRef(false);

  const jobs = workerData?.recent_jobs ?? [];

  useEffect(() => { setMounted(true); }, []);

  const refreshWorkerData = useCallback(async (addr: string, showLoading = false) => {
    if (showLoading) setApiLoading(true);
    try {
      const wd = await fetchWorker(addr);
      setWorkerData(wd);
      setNotRegistered(false);
      setConfidential(wd.is_confidential);
      if (wd.status === "Active" || wd.status === "Paused" || wd.status === "Stopping") {
        setStatus(wd.status);
      }
      setLatency(jobsToLatency(wd.recent_jobs ?? []));

      const lb = await fetchLeaderboard("goodput", 100).catch(() => null);
      if (lb) {
        const idx = lb.ranked.findIndex((w) => w.address === addr);
        setNetworkRank(idx >= 0 ? idx + 1 : null);
      } else {
        setNetworkRank(null);
      }
    } catch (err) {
      if (String(err).includes("404") || String(err).includes("Not Found")) {
        setNotRegistered(true);
        setWorkerData(null);
        setLatency([]);
        setNetworkRank(null);
      }
    } finally {
      if (showLoading) setApiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setWorkerData(null);
      setNotRegistered(false);
      setNetworkRank(null);
      setLatency([]);
      setStatus("Paused");
      return;
    }
    const addr = publicKey.toBase58();
    void refreshWorkerData(addr, true);
    const poll = setInterval(() => void refreshWorkerData(addr), 5000);
    return () => clearInterval(poll);
  }, [publicKey, refreshWorkerData]);

  useEffect(() => {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    const prefix = addr.slice(0, 8);
    const unsub = subscribeLive((event) => {
      const ev = event as { type?: string; worker?: string };
      if (ev.type === "job" && ev.worker === prefix) {
        void refreshWorkerData(addr);
      }
    });
    return unsub;
  }, [publicKey, refreshWorkerData]);

  const finishPause = useCallback(async (addr: string) => {
    stoppingRef.current = false;
    if (browserWorker.status !== "offline") {
      await browserWorker.stopWorker();
    }
    await setWorkerStatus(addr, "Paused");
    setStatus("Paused");
    void refreshWorkerData(addr);
  }, [browserWorker, refreshWorkerData]);

  useEffect(() => {
    if (status !== "Stopping" || !publicKey || !stoppingRef.current) return;
    const busy = browserWorker.status === "working" || browserWorker.currentJobId !== null;
    if (busy) return;
    void finishPause(publicKey.toBase58());
  }, [status, publicKey, browserWorker.status, browserWorker.currentJobId, finishPause]);

  async function handleToggle() {
    if (!publicKey || !connected || !workerData) return;
    const addr = publicKey.toBase58();
    if (statusBusy) return;

    setStatusBusy(true);
    try {
      if (status === "Active") {
        const jobInFlight = browserWorker.status === "working" || browserWorker.currentJobId !== null;
        if (jobInFlight) {
          stoppingRef.current = true;
          await setWorkerStatus(addr, "Stopping");
          setStatus("Stopping");
        } else {
          await finishPause(addr);
        }
      } else if (status === "Paused") {
        await setWorkerStatus(addr, "Active");
        setStatus("Active");
        void refreshWorkerData(addr);
      } else {
        stoppingRef.current = false;
        await finishPause(addr);
      }
    } catch (e) {
      console.error("Worker status toggle failed:", e);
    } finally {
      setStatusBusy(false);
    }
  }

  const dispAddr = mounted && publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : "—";

  const statusColor = status === "Active" ? "var(--green)" : status === "Stopping" ? "var(--yellow)" : "var(--text-secondary)";
  const hasData = !!workerData;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>

      {!connected && (
        <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 8, background: "var(--bg-3)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Connect your wallet to view your worker dashboard.
        </div>
      )}

      {mounted && connected && notRegistered && (
        <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 8, background: "rgba(255,160,0,0.06)", border: "1px solid rgba(255,160,0,0.2)", fontSize: 13, color: "var(--orange)", lineHeight: 1.6 }}>
          <strong>Wallet connected but not registered as a worker.</strong> Switch to the Start Earning tab, connect your GPU, and register first.
        </div>
      )}

      {apiLoading && connected && (
        <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-muted)" }}>
          Fetching worker data…
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Worker Dashboard</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
            <span style={{ fontFamily: "monospace" }}>{dispAddr}</span>
            {hasData && (
              <>
                <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
                {workerData.hardware_tier}
                <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
                {workerData.role}
                <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
                <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 700 }}>LIVE</span>
              </>
            )}
          </div>
        </div>
        {hasData && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 6,
            background: `${statusColor}14`,
            border: `1px solid ${statusColor}40`,
            color: statusColor, fontSize: 12, fontWeight: 700,
          }}>
            <span className={status === "Active" ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
            {workerData.status.toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>STATUS & CONTROLS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => void handleToggle()}
                disabled={!connected || !hasData || notRegistered || statusBusy}
                style={{
                  width: "100%", height: 56, borderRadius: 8,
                  background: status === "Active" ? "#FFFFFF" : "var(--bg-3)",
                  border: "none", cursor: connected && hasData && !notRegistered && !statusBusy ? "pointer" : "not-allowed",
                  fontSize: 14, fontWeight: 800,
                  color: status === "Active" ? "#000000" : "var(--text-secondary)",
                  opacity: connected && hasData && !notRegistered ? 1 : 0.5,
                  transition: "all 0.2s",
                }}
              >
                {!hasData
                  ? "Register a worker to control status"
                  : statusBusy
                    ? "Updating…"
                    : status === "Active"
                      ? "ACTIVE — Click to Pause"
                      : status === "Stopping"
                        ? "STOPPING — finishing current job…"
                        : "PAUSED — Click to Resume"}
              </button>
              {hasData && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", fontWeight: 700 }}>
                  {status === "Active" && "Stops all workers connected to your wallet"}
                  {status === "Stopping" && "Your current job will finish, then all workers pause"}
                  {status === "Paused" && "Not accepting new requests — restart browser worker on Start Earning to go live"}
                </div>
              )}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px", background: "var(--bg-3)", borderRadius: 6,
              opacity: hasData ? 1 : 0.5,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: confidential ? "var(--purple)" : "var(--text-secondary)", marginBottom: 2 }}>Confidential Mode</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>TEE-only jobs · premium pay</div>
                {!hasData && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Register worker first</div>
                )}
                {hasData && !workerData.tee_capable && (
                  <div style={{ fontSize: 10, color: "var(--orange)", marginTop: 4 }}>Re-register with TEE enabled to accept privacy jobs</div>
                )}
              </div>
              <div
                className={`toggle${confidential ? " on" : ""}`}
                style={{
                  background: confidential ? "var(--purple)" : undefined,
                  borderColor: confidential ? "var(--purple)" : undefined,
                  pointerEvents: hasData && workerData.tee_capable ? "auto" : "none",
                  opacity: hasData && workerData.tee_capable ? 1 : 0.5,
                }}
                onClick={() => {
                  if (!hasData || !workerData.tee_capable || !publicKey) return;
                  void setWorkerConfidentialMode(publicKey.toBase58(), !confidential)
                    .then((r) => setConfidential(r.is_confidential))
                    .catch((e) => console.error("Confidential mode toggle failed:", e));
                }}
              >
                <div className="toggle-thumb" />
              </div>
            </div>

            {hasData && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{workerData.jobs_today}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>jobs today</div>
                </div>
                <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>{workerData.penalties_paid.toFixed(4)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>$LOCK penalized</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card card-orange">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>EARNINGS TODAY</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--orange)", letterSpacing: "-1px" }}>
            {dashNum(workerData?.earnings_today)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, fontWeight: 700 }}>$LOCK</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{hasData ? workerData.jobs_today : "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>jobs today</div>
            </div>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {hasData ? `${workerData.p99_ttft_ms}ms` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>p99 TTFT</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>SLA PERFORMANCE</div>
          <div style={{
            fontSize: 38, fontWeight: 900, letterSpacing: "-1px",
            color: !hasData ? "var(--text-muted)" : workerData.sla_pass_rate >= 99 ? "var(--green)" : workerData.sla_pass_rate >= 97 ? "var(--yellow)" : "var(--red)",
          }}>
            {hasData ? `${workerData.sla_pass_rate.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>pass rate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["realtime", "standard", "confidential"] as const).map((tier) => {
              const tierJobs = jobs.filter((j) => j.sla_tier === tier);
              const passed = tierJobs.filter((j) => j.sla_met).length;
              const pct = tierJobs.length ? Math.round((passed / tierJobs.length) * 100) : 0;
              const colors: Record<string, string> = { realtime: "var(--green)", standard: "var(--orange)", confidential: "var(--purple)" };
              return (
                <div key={tier}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: colors[tier], fontWeight: 700, textTransform: "uppercase" }}>{tier}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{tierJobs.length ? `${pct}%` : "—"}</span>
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
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>LIVE LATENCY</div>
          {latency.length > 0 ? (
            <>
              <ChartWrapper height={160}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latency}>
                    <XAxis hide />
                    <YAxis hide domain={[0, 600]} />
                    <Tooltip contentStyle={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} labelStyle={{ display: "none" }} />
                    <ReferenceLine y={300} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 2" strokeWidth={2} />
                    <Line type="monotone" dataKey="ttft" stroke="#ffffff" dot={false} strokeWidth={2} name="TTFT ms" />
                    <Line type="monotone" dataKey="tpot" stroke="rgba(255,255,255,0.25)" dot={false} strokeWidth={1.5} name="TPOT ms" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartWrapper>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-primary)" }}>— TTFT</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— TPOT</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>- - SLA limit</span>
              </div>
            </>
          ) : (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)" }}>
              No latency data yet — complete jobs to populate this chart.
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>GOODPUT</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: hasData ? "var(--orange)" : "var(--text-muted)" }}>
            {hasData ? workerData.goodput_score : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>req/s within SLA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Network rank</span>
              <span style={{ color: "var(--orange)", fontWeight: 700 }}>{networkRank != null ? `#${networkRank}` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Role</span>
              <span style={{ fontWeight: 700 }}>{hasData ? workerData.role : "—"}</span>
            </div>
            {workerData?.tee_capable && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>TEE</span>
                <span style={{ fontWeight: 700, color: "var(--purple)" }}>CAPABLE</span>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>RELIABILITY</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: hasData ? "var(--green)" : "var(--text-muted)" }}>
            {hasData ? fmt(workerData.reliability_score, 0) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>/10000</div>
          {hasData && (
            <>
              <div className="progress-track" style={{ marginBottom: 10 }}>
                <div className="progress-fill" style={{ width: `${(workerData.reliability_score / 10000) * 100}%`, background: "var(--green)" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Reliability score from on-chain worker history
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>STAKED $LOCK</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>
            {hasData ? fmt(workerData.staked_lock, 0) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>$LOCK</div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>JOB HISTORY</div>
            {hasData && (
              <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, background: "rgba(34,204,102,0.08)", borderRadius: 4, padding: "2px 8px" }}>
                LIVE
              </span>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {["Job ID", "Model", "Tier", "TTFT", "TPOT", "SLA", "Penalty"].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "24px 12px" }}>
                      {hasData ? "No jobs yet." : "Connect and register a worker to see job history."}
                    </td>
                  </tr>
                ) : jobs.map((j) => (
                  <tr key={j.id}>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{j.id.slice(0, 10)}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{j.model.split("-").slice(0, 2).join("-")}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, color: j.sla_tier === "realtime" ? "var(--orange)" : j.sla_tier === "confidential" ? "var(--purple)" : "var(--text-muted)" }}>
                        {j.sla_tier.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ color: j.ttft_ms > 300 ? "var(--red)" : "var(--text-primary)", fontWeight: 700 }}>{j.ttft_ms}ms</td>
                    <td style={{ color: "var(--text-secondary)" }}>{j.tpot_ms}ms</td>
                    <td><span style={{ fontWeight: 800, fontSize: 11, color: j.sla_met ? "var(--green)" : "var(--red)" }}>{j.sla_met ? "MET" : "MISS"}</span></td>
                    <td style={{ color: "var(--red)", fontSize: 11 }}>
                      {j.penalty_paid ? `-${j.penalty_paid} $LOCK` : <span style={{ color: "var(--text-muted)" }}>—</span>}
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
