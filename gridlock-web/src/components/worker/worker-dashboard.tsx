"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { generateJobs, type Job } from "@/lib/mock-data";
import { ChartWrapper } from "@/components/chart-wrapper";
import {
  fetchWorker,
  fetchLeaderboard,
  subscribeLive,
  setWorkerStatus,
  type ApiWorker,
  type ApiJob,
} from "@/lib/api-client";
import { fmt } from "@/lib/utils";
import { useBrowserWorker } from "@/context/browser-worker-context";

type WorkerState = "Active" | "Paused" | "Stopping";

function generateLatencyPoints(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    t: `${i}`,
    ttft: Math.floor(Math.random() * 200 + 100),
    tpot: Math.floor(Math.random() * 60 + 30),
  }));
}

function jobsToLatency(jobs: ApiJob[]) {
  if (!jobs.length) return [];
  return [...jobs].reverse().slice(-20).map((j, i) => ({
    t: String(i),
    ttft: j.ttft_ms,
    tpot: j.tpot_ms,
  }));
}

export function WorkerDashboard() {
  const { publicKey, connected } = useWallet();
  const browserWorker = useBrowserWorker();
  const [mounted, setMounted] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  // Real API state
  const [workerData, setWorkerData]   = useState<ApiWorker | null>(null);
  const [apiJobs, setApiJobs]         = useState<ApiJob[] | null>(null);
  const [apiLoading, setApiLoading]   = useState(false);
  const [notRegistered, setNotRegistered] = useState(false);
  const [networkRank, setNetworkRank] = useState<number | null>(null);

  // Local UI state
  const [status, setStatus]           = useState<WorkerState>("Active");
  const [confidential, setConfidential] = useState(false);
  const [latency, setLatency]         = useState<ReturnType<typeof generateLatencyPoints>>([]);
  const [mockJobs, setMockJobs]       = useState<Job[]>([]);
  const [earnings, setEarnings]       = useState({ lock: 142.38, confidentialPremium: 9.44 });
  const [slaPass, setSlaPass]         = useState(98.2);
  const [goodput, setGoodput]         = useState(847);
  const [inFlight, setInFlight]       = useState(0);
  const stoppingRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  const refreshWorkerData = useCallback(async (addr: string, showLoading = false) => {
    if (showLoading) setApiLoading(true);
    try {
      const wd = await fetchWorker(addr);
      setWorkerData(wd);
      setNotRegistered(false);
      setApiJobs(wd.recent_jobs ?? []);
      setConfidential(wd.is_confidential);
      if (wd.status === "Active" || wd.status === "Paused" || wd.status === "Stopping") {
        setStatus(wd.status);
      }
      const points = jobsToLatency(wd.recent_jobs ?? []);
      if (points.length) setLatency(points);

      const lb = await fetchLeaderboard("goodput", 100).catch(() => null);
      if (lb) {
        const idx = lb.ranked.findIndex((w) => w.address === addr);
        setNetworkRank(idx >= 0 ? idx + 1 : null);
      }
    } catch (err) {
      if (String(err).includes("404") || String(err).includes("Not Found")) {
        setNotRegistered(true);
        setWorkerData(null);
        setApiJobs(null);
      }
    } finally {
      if (showLoading) setApiLoading(false);
    }
  }, []);

  // Seed mock data for fallback when wallet not connected
  useEffect(() => {
    setLatency(generateLatencyPoints());
    setMockJobs(generateJobs(8));
  }, []);

  // Fetch + poll when wallet connects
  useEffect(() => {
    if (!publicKey) {
      setWorkerData(null);
      setApiJobs(null);
      setNotRegistered(false);
      setNetworkRank(null);
      return;
    }
    const addr = publicKey.toBase58();
    void refreshWorkerData(addr, true);
    const poll = setInterval(() => void refreshWorkerData(addr), 5000);
    return () => clearInterval(poll);
  }, [publicKey, refreshWorkerData]);

  // Live refresh when a job settles for this worker
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

  // Live mock update when no real worker connected
  useEffect(() => {
    const id = setInterval(() => {
      if (status !== "Active" || workerData) return;
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
      setMockJobs(generateJobs(8));
    }, 1500);
    return () => clearInterval(id);
  }, [status, confidential, workerData]);

  const finishPause = useCallback(async (addr: string) => {
    stoppingRef.current = false;
    if (browserWorker.status !== "offline") {
      await browserWorker.stopWorker();
    }
    await setWorkerStatus(addr, "Paused");
    setStatus("Paused");
    setInFlight(0);
    void refreshWorkerData(addr);
  }, [browserWorker, refreshWorkerData]);

  // Finish pausing once the current browser job completes.
  useEffect(() => {
    if (status !== "Stopping" || !publicKey || !stoppingRef.current) return;
    const busy = browserWorker.status === "working" || browserWorker.currentJobId !== null;
    setInFlight(busy ? 1 : 0);
    if (busy) return;
    void finishPause(publicKey.toBase58());
  }, [status, publicKey, browserWorker.status, browserWorker.currentJobId, finishPause]);

  async function handleToggle() {
    if (!publicKey || !connected) return;
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
          setInFlight(1);
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

  // Derived display values — real data wins over mock
  const dispEarnings    = workerData ? workerData.earnings_today : earnings.lock;
  const dispSlaPass     = workerData ? workerData.sla_pass_rate : slaPass;
  const dispGoodput     = workerData ? workerData.goodput_score : goodput;
  const dispReliability = workerData ? workerData.reliability_score : 9240;
  const dispStake       = workerData ? workerData.staked_lock : 25000;
  const dispRole        = workerData ? workerData.role : "Prefill";
  const dispHW          = workerData ? workerData.hardware_tier : "RTX 4090";
  const dispAddr        = mounted && publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : "7xKm…b3Rq";

  const jobs       = apiJobs ?? mockJobs;
  const statusColor = status === "Active" ? "var(--green)" : status === "Stopping" ? "var(--yellow)" : "var(--text-secondary)";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      {/* Not registered notice */}
      {mounted && connected && notRegistered && (
        <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 8, background: "rgba(255,160,0,0.06)", border: "1px solid rgba(255,160,0,0.2)", fontSize: 13, color: "var(--orange)", lineHeight: 1.6 }}>
          <strong>Wallet connected but not registered as a worker.</strong> Switch to the Start Earning tab, connect your GPU, and register first.
        </div>
      )}

      {/* API loading indicator */}
      {apiLoading && (
        <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-muted)" }}>
          Fetching worker data…
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Worker Dashboard</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
            <span style={{ fontFamily: "monospace" }}>{dispAddr}</span>
            <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
            {dispHW}
            <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
            {dispRole}
            {workerData && (
              <>
                <span style={{ margin: "0 8px", color: "var(--border-2)" }}>·</span>
                <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 700 }}>LIVE</span>
              </>
            )}
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
          {workerData ? workerData.status.toUpperCase() : status.toUpperCase()}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Status + Controls */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>STATUS & CONTROLS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => void handleToggle()}
                disabled={!connected || notRegistered || statusBusy}
                style={{
                width: "100%", height: 56, borderRadius: 8,
                background: status === "Active" ? "#FFFFFF" : status === "Stopping" ? "var(--bg-3)" : "var(--bg-3)",
                border: "none", cursor: connected && !notRegistered && !statusBusy ? "pointer" : "not-allowed",
                fontSize: 14, fontWeight: 800,
                color: status === "Active" ? "#000000" : "var(--text-secondary)",
                opacity: connected && !notRegistered ? 1 : 0.5,
                transition: "all 0.2s",
              }}>
                {statusBusy
                  ? "Updating…"
                  : status === "Active"
                    ? "ACTIVE — Click to Pause"
                    : status === "Stopping"
                      ? "STOPPING — finishing current job…"
                      : "PAUSED — Click to Resume"}
              </button>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", fontWeight: 700 }}>
                {status === "Active" && "Stops browser + native workers for your wallet"}
                {status === "Stopping" && "Your current job will finish, then all workers pause"}
                {status === "Paused" && "Not accepting new requests — restart browser worker on Start Earning to go live"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: "var(--bg-3)", borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: confidential ? "var(--purple)" : "var(--text-secondary)", marginBottom: 2 }}>Confidential Mode</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>TEE-only jobs · premium pay</div>
              </div>
              <div className={`toggle${confidential ? " on" : ""}`}
                style={{ background: confidential ? "var(--purple)" : undefined, borderColor: confidential ? "var(--purple)" : undefined }}
                onClick={() => setConfidential((c) => !c)}>
                <div className="toggle-thumb" />
              </div>
            </div>

            {workerData && (
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

        {/* Earnings */}
        <div className="card card-orange">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>EARNINGS TODAY</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--orange)", letterSpacing: "-1px" }}>{dispEarnings.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, fontWeight: 700 }}>$LOCK</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {workerData
                  ? `${workerData.jobs_today}`
                  : `${jobs.filter((j) => (j as Job).slaMet).length}/${jobs.length}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{workerData ? "jobs today" : "SLA met / batch"}</div>
            </div>
            <div style={{ background: confidential ? "rgba(255,255,255,0.04)" : "var(--bg-3)", borderRadius: 6, padding: "10px", border: confidential ? "1px solid var(--border-2)" : "1px solid transparent" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: confidential ? "var(--purple)" : "var(--text-secondary)" }}>
                {workerData ? workerData.p99_ttft_ms + "ms" : `+${earnings.confidentialPremium.toFixed(2)}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{workerData ? "p99 TTFT" : "TEE premium"}</div>
            </div>
          </div>
        </div>

        {/* SLA Performance */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 16 }}>SLA PERFORMANCE</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: dispSlaPass >= 99 ? "var(--green)" : dispSlaPass >= 97 ? "var(--yellow)" : "var(--red)", letterSpacing: "-1px" }}>
            {dispSlaPass.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>pass rate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["realtime", "standard", "confidential"] as const).map((tier) => {
              const tierJobs = (jobs as (Job | ApiJob)[]).filter((j) =>
                ("slaTier" in j ? j.slaTier : (j as ApiJob).sla_tier) === tier
              );
              const passed = tierJobs.filter((j) => "slaMet" in j ? j.slaMet : (j as ApiJob).sla_met).length;
              const pct = tierJobs.length ? Math.round((passed / tierJobs.length) * 100) : (dispSlaPass > 0 ? Math.round(dispSlaPass) : 100);
              const colors: Record<string, string> = { realtime: "var(--green)", standard: "var(--orange)", confidential: "var(--purple)" };
              return (
                <div key={tier}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: colors[tier], fontWeight: 700, textTransform: "uppercase" }}>{tier}</span>
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
        </div>

        {/* Goodput */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>GOODPUT</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "var(--orange)" }}>{dispGoodput}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>req/s within SLA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Network rank</span>
              <span style={{ color: "var(--orange)", fontWeight: 700 }}>{networkRank != null ? `#${networkRank}` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>GPU util</span>
              <span style={{ fontWeight: 700 }}>87%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Role</span>
              <span style={{ fontWeight: 700 }}>{dispRole}</span>
            </div>
            {workerData?.tee_capable && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>TEE</span>
                <span style={{ fontWeight: 700, color: "var(--purple)" }}>CAPABLE</span>
              </div>
            )}
          </div>
        </div>

        {/* Reliability */}
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>RELIABILITY</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "var(--green)" }}>{fmt(dispReliability, 0)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>/10000</div>
          <div className="progress-track" style={{ marginBottom: 10 }}>
            <div className="progress-fill" style={{ width: `${(dispReliability / 10000) * 100}%`, background: "var(--green)" }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Next tier at <span style={{ color: "var(--orange)", fontWeight: 700 }}>9,500</span> — unlocks Realtime jobs
          </div>
        </div>
      </div>

      {/* Stake + Recent Jobs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>STAKED $LOCK</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>{fmt(dispStake, 0)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, fontWeight: 700 }}>$LOCK</div>
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
          <div style={{ fontSize: 11, color: "#777777", background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "8px", fontWeight: 700 }}>
            8% APY · ~{(dispStake * 0.08 / 365).toFixed(2)} $LOCK/day
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>RECENT JOBS</div>
            {workerData && (
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
                {apiJobs ? apiJobs.map((j) => (
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
                )) : mockJobs.map((j) => (
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
                      {j.penaltyPaid ? `-${j.penaltyPaid} $LOCK` : <span style={{ color: "var(--text-muted)" }}>—</span>}
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
