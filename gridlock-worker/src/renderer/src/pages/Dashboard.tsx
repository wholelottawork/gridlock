import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'

type GPU = {
  name: string
  vram_used_gb: number
  vram_total_gb: number
  utilization: number
  temperature: number
  power_w: number
  power_max_w: number
}

type Job = { id: string; status: 'completed' | 'failed'; tokens: number; earn: number; ts: number }
type ActiveJob = { id: string; progress: number; tokens: number; tier: string }

const MOCK_GPU: GPU = {
  name: 'RTX 4090',
  vram_used_gb: 16.2,
  vram_total_gb: 24.0,
  utilization: 0,
  temperature: 45,
  power_w: 80,
  power_max_w: 450
}

const TIERS = ['Nano', 'Micro', 'Batch', 'Realtime']

function GaugeBar({ label, pct, valueLabel, color }: { label: string; pct: number; valueLabel: string; color: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span className="label">{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{valueLabel}</span>
      </div>
      <div style={{ height: 3, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 2 }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [workerOn, setWorkerOn] = useState(false)
  const [gpu, setGpu] = useState<GPU>(MOCK_GPU)
  const [jobs, setJobs] = useState<Job[]>([])
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [tokensPerSec, setTokensPerSec] = useState(0)
  const [earningsToday, setEarningsToday] = useState(0)
  const [jobsToday, setJobsToday] = useState(0)
  const [history, setHistory] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({ t: i, v: 0 }))
  )

  // Poll daemon for real data
  useEffect(() => {
    const gl = (window as unknown as { gridlock?: { daemon: { status: () => Promise<{ running: boolean; gpu: GPU | null; active_job: ActiveJob | null; tokens_per_sec: number; jobs_today: number; earnings_today: number }> } } }).gridlock
    if (!gl) return
    const poll = async () => {
      try {
        const s = await gl.daemon.status()
        if (s.gpu) setGpu(s.gpu)
        setWorkerOn(s.running)
        setTokensPerSec(s.tokens_per_sec ?? 0)
        setJobsToday(s.jobs_today ?? 0)
        setEarningsToday(s.earnings_today ?? 0)
        if (s.active_job) setActiveJob(s.active_job as ActiveJob)
        else if (!s.running) setActiveJob(null)
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 1200)
    return () => clearInterval(iv)
  }, [])

  // Simulate live numbers when running (fallback when no daemon)
  useEffect(() => {
    if (!workerOn) {
      setGpu(g => ({ ...g, utilization: 0, power_w: 80 }))
      setTokensPerSec(0)
      return
    }
    const iv = setInterval(() => {
      const gl = (window as unknown as { gridlock?: unknown }).gridlock
      if (gl) return // let daemon drive numbers
      setGpu(g => ({
        ...g,
        utilization: Math.min(97, Math.max(62, g.utilization + (Math.random() - 0.4) * 9)),
        vram_used_gb: Math.min(22, Math.max(14, g.vram_used_gb + (Math.random() - 0.5) * 0.4)),
        temperature: Math.min(84, Math.max(65, g.temperature + (Math.random() - 0.5) * 2)),
        power_w: Math.min(430, Math.max(320, g.power_w + (Math.random() - 0.5) * 22))
      }))
      setTokensPerSec(v => Math.max(1800, Math.min(3500, v || 2400) + (Math.random() - 0.5) * 200))
      setHistory(h => [...h.slice(1), { t: h[h.length - 1].t + 1, v: Math.floor(2000 + Math.random() * 1400) }])

      // Mock job lifecycle
      setActiveJob(j => {
        if (!j) {
          if (Math.random() < 0.12) {
            return { id: Math.random().toString(16).slice(2, 10), progress: 0, tokens: [512, 1024, 2048, 4096][Math.floor(Math.random() * 4)], tier: TIERS[Math.floor(Math.random() * 4)] }
          }
          return null
        }
        const next = j.progress + Math.random() * 14
        if (next >= 100) {
          const earn = +((j.tokens / 1_000_000) * 8.5).toFixed(4)
          setJobs(prev => [{ id: j.id, status: 'completed', tokens: j.tokens, earn, ts: Date.now() }, ...prev.slice(0, 14)])
          setEarningsToday(e => +(e + earn).toFixed(4))
          setJobsToday(n => n + 1)
          setHistory(h => [...h.slice(1), { t: h[h.length - 1].t + 1, v: Math.floor(2400 + Math.random() * 1000) }])
          return null
        }
        return { ...j, progress: next }
      })
    }, 700)
    return () => clearInterval(iv)
  }, [workerOn])

  const toggle = useCallback(async () => {
    const gl = (window as unknown as { gridlock?: { worker: { start: () => Promise<{ ok: boolean }>; stop: () => Promise<{ ok: boolean }> } } }).gridlock
    if (!workerOn) {
      try { await gl?.worker.start() } catch {}
      setWorkerOn(true)
    } else {
      try { await gl?.worker.stop() } catch {}
      setWorkerOn(false)
      setActiveJob(null)
    }
  }, [workerOn])

  const gpuPct   = gpu.utilization
  const vramPct  = (gpu.vram_used_gb / gpu.vram_total_gb) * 100
  const tempColor = gpu.temperature > 80 ? 'var(--red)' : gpu.temperature > 70 ? 'var(--yellow)' : 'var(--text-primary)'
  const gpuColor  = gpuPct > 90 ? 'var(--orange)' : gpuPct > 70 ? 'var(--yellow)' : 'var(--text-primary)'

  const statusLabel = activeJob ? 'COMPUTING' : workerOn ? 'IDLE' : 'OFFLINE'
  const statusColor = activeJob ? 'var(--orange)' : workerOn ? 'var(--green)' : 'var(--text-muted)'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 3 }}>Dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span className={workerOn ? 'pulse' : ''} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            {statusLabel}
          </div>
        </div>
        <button onClick={toggle} style={{
          padding: '9px 24px', borderRadius: 6, fontWeight: 800, fontSize: 12, letterSpacing: '0.5px',
          background: workerOn ? 'rgba(255,255,255,0.05)' : '#ffffff',
          color: workerOn ? 'var(--text-primary)' : '#000000',
          border: workerOn ? '1px solid var(--border-2)' : '1px solid #ffffff',
          cursor: 'pointer', transition: 'all 0.15s'
        }}>
          {workerOn ? 'STOP' : 'START WORKER'}
        </button>
      </div>

      {/* GPU */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>GPU</div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{gpu.name}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11 }}>
            <div style={{ color: tempColor, fontWeight: 700 }}>{gpu.temperature}°C</div>
            <div style={{ color: 'var(--text-muted)' }}>{gpu.power_w}W / {gpu.power_max_w}W</div>
          </div>
        </div>
        <GaugeBar label="VRAM" pct={vramPct}  valueLabel={`${gpu.vram_used_gb.toFixed(1)} / ${gpu.vram_total_gb} GB`} color="var(--text-primary)" />
        <GaugeBar label="COMPUTE" pct={gpuPct} valueLabel={`${Math.round(gpuPct)}%`} color={gpuColor} />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'JOBS TODAY',    val: jobsToday.toString() },
          { label: 'TOKENS / SEC',  val: workerOn ? tokensPerSec.toLocaleString() : '—' },
          { label: 'EARNED TODAY',  val: `${earningsToday.toFixed(2)} $LOCK` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div className="label" style={{ marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Throughput chart */}
      {workerOn && (
        <div className="card" style={{ marginBottom: 14, padding: '12px 14px' }}>
          <div className="label" style={{ marginBottom: 10 }}>THROUGHPUT</div>
          <ResponsiveContainer width="100%" height={52}>
            <AreaChart data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--orange)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--orange)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="var(--orange)" strokeWidth={1.5} fill="url(#tg)" dot={false} isAnimationActive={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', fontSize: 10, borderRadius: 4, padding: '4px 8px' }}
                formatter={(v: number) => [`${v.toLocaleString()} tok/s`, '']}
                labelFormatter={() => ''}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Active job */}
      {activeJob && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 10 }}>CURRENT JOB</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11 }}>
            <span className="mono" style={{ color: 'var(--text-secondary)' }}>#{activeJob.id.slice(0,8)}</span>
            <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
              <span>{activeJob.tier ?? 'Batch'}</span>
              <span>{activeJob.tokens.toLocaleString()} tokens</span>
            </div>
          </div>
          <div style={{ height: 3, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
            <motion.div
              animate={{ width: `${Math.min(100, activeJob.progress)}%` }}
              style={{ height: '100%', background: 'var(--orange)', borderRadius: 2 }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
            {Math.min(100, Math.floor(activeJob.progress))}%
          </div>
        </div>
      )}

      {/* Recent jobs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span className="label">RECENT JOBS</span>
        </div>
        {jobs.length === 0 && (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {workerOn ? 'Waiting for first job…' : 'Start the worker to begin earning'}
          </div>
        )}
        {jobs.slice(0, 8).map(j => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--border)', gap: 10, fontSize: 11 }}>
            <span style={{ color: j.status === 'completed' ? 'var(--green)' : 'var(--red)', fontWeight: 700, width: 12 }}>
              {j.status === 'completed' ? '✓' : '✗'}
            </span>
            <span className="mono" style={{ color: 'var(--text-secondary)', flex: 1 }}>#{j.id.slice(0,8)}</span>
            <span style={{ color: 'var(--text-muted)' }}>{j.tokens.toLocaleString()} tok</span>
            <span style={{ color: 'var(--orange)', fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
              {j.status === 'completed' ? `+${j.earn} $LOCK` : '—'}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
