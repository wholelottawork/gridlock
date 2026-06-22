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

function CircleGauge({ pct, size = 90, stroke = 6, label, value }: {
  pct: number; size?: number; stroke?: number; label: string; value: string
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const gap = circ * 0.28
  const arcLen = circ - gap
  const filled = arcLen * Math.min(1, pct / 100)
  const offset = -circ * 0.14

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--bg-4)" strokeWidth={stroke}
          strokeDasharray={`${arcLen} ${gap}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--text-primary)" strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          animate={{ strokeDasharray: `${filled} ${circ - filled}` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function StatBar({ label, pct, valueLabel }: { label: string; pct: number; valueLabel: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{valueLabel}</span>
      </div>
      <div style={{ height: 2, background: 'var(--bg-4)', borderRadius: 1, overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ height: '100%', background: 'var(--text-primary)', borderRadius: 1 }}
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

  useEffect(() => {
    if (!workerOn) {
      setGpu(g => ({ ...g, utilization: 0, power_w: 80 }))
      setTokensPerSec(0)
      return
    }
    const iv = setInterval(() => {
      const gl = (window as unknown as { gridlock?: unknown }).gridlock
      if (gl) return
      setGpu(g => ({
        ...g,
        utilization: Math.min(97, Math.max(62, g.utilization + (Math.random() - 0.4) * 9)),
        vram_used_gb: Math.min(22, Math.max(14, g.vram_used_gb + (Math.random() - 0.5) * 0.4)),
        temperature: Math.min(84, Math.max(65, g.temperature + (Math.random() - 0.5) * 2)),
        power_w: Math.min(430, Math.max(320, g.power_w + (Math.random() - 0.5) * 22))
      }))
      setTokensPerSec(v => Math.max(1800, Math.min(3500, v || 2400) + (Math.random() - 0.5) * 200))
      setHistory(h => [...h.slice(1), { t: h[h.length - 1].t + 1, v: Math.floor(2000 + Math.random() * 1400) }])
      setActiveJob(j => {
        if (!j) {
          if (Math.random() < 0.12)
            return { id: Math.random().toString(16).slice(2, 10), progress: 0, tokens: [512, 1024, 2048, 4096][Math.floor(Math.random() * 4)], tier: TIERS[Math.floor(Math.random() * 4)] }
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

  const vramPct = (gpu.vram_used_gb / gpu.vram_total_gb) * 100
  const statusLabel = activeJob ? 'COMPUTING' : workerOn ? 'IDLE' : 'OFFLINE'
  const statusDotColor = workerOn ? 'var(--text-primary)' : 'var(--text-muted)'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.2px', marginBottom: 4 }}>Dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={workerOn ? 'pulse-dot' : ''} style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: statusDotColor }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)' }}>{statusLabel}</span>
          </div>
        </div>
        <button onClick={toggle} style={{
          padding: '8px 22px', borderRadius: 6, fontWeight: 800, fontSize: 11, letterSpacing: '0.8px',
          background: workerOn ? 'var(--accent-dim)' : 'var(--text-primary)',
          color: workerOn ? 'var(--text-primary)' : '#000000',
          border: workerOn ? '1px solid var(--border-2)' : '1px solid var(--text-primary)',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}>
          {workerOn ? 'STOP' : 'START WORKER'}
        </button>
      </div>

      {/* GPU card */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <CircleGauge pct={gpu.utilization} label="GPU" value={`${Math.round(gpu.utilization)}%`} size={88} stroke={6} />
          <CircleGauge pct={vramPct} label="VRAM" value={`${gpu.vram_used_gb.toFixed(0)}G`} size={88} stroke={6} />
          <div style={{ flex: 1, paddingLeft: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>{gpu.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StatBar label="VRAM" pct={vramPct} valueLabel={`${gpu.vram_used_gb.toFixed(1)} / ${gpu.vram_total_gb} GB`} />
              <StatBar label="POWER" pct={(gpu.power_w / gpu.power_max_w) * 100} valueLabel={`${Math.round(gpu.power_w)}W`} />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>Temp <strong style={{ color: 'var(--text-secondary)' }}>{gpu.temperature}°C</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Max <strong style={{ color: 'var(--text-secondary)' }}>{gpu.power_max_w}W</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'JOBS TODAY',   val: jobsToday.toString() },
          { label: 'TOKENS / SEC', val: workerOn ? Math.round(tokensPerSec).toLocaleString() : '—' },
          { label: 'EARNED TODAY', val: `${earningsToday.toFixed(4)} $LOCK` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Throughput chart */}
      {workerOn && (
        <div className="card" style={{ marginBottom: 12, padding: '11px 13px' }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 9 }}>THROUGHPUT</div>
          <ResponsiveContainer width="100%" height={46}>
            <AreaChart data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ffffff" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#ffffff" strokeWidth={1.4} fill="url(#tg)" dot={false} isAnimationActive={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', fontSize: 10, borderRadius: 4, padding: '3px 8px' }}
                formatter={(v: number) => [`${v.toLocaleString()} tok/s`, '']}
                labelFormatter={() => ''}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Active job */}
      {activeJob && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CURRENT JOB</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{activeJob.tier ?? 'Batch'}</span>
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>#{activeJob.id.slice(0, 8)}</span>
            </div>
          </div>
          <div style={{ height: 2, background: 'var(--bg-4)', borderRadius: 1, overflow: 'hidden', marginBottom: 5 }}>
            <motion.div
              animate={{ width: `${Math.min(100, activeJob.progress)}%` }}
              style={{ height: '100%', background: 'var(--text-primary)', borderRadius: 1 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{activeJob.tokens.toLocaleString()} tokens</span>
            <span>{Math.min(100, Math.floor(activeJob.progress))}%</span>
          </div>
        </div>
      )}

      {/* Recent jobs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>RECENT JOBS</span>
        </div>
        {jobs.length === 0 ? (
          <div style={{ padding: '22px 13px', textAlign: 'center', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>
            {workerOn ? 'Waiting for first job…' : 'Start the worker to begin earning'}
          </div>
        ) : (
          jobs.slice(0, 8).map(j => (
            <div key={j.id} style={{
              display: 'flex', alignItems: 'center', padding: '8px 13px',
              borderBottom: '1px solid var(--border)', gap: 10, fontSize: 11,
            }}>
              <span style={{ color: j.status === 'completed' ? 'var(--success)' : 'var(--error)', fontWeight: 800, fontSize: 12, width: 14 }}>
                {j.status === 'completed' ? '✓' : '✗'}
              </span>
              <span className="mono" style={{ color: 'var(--text-secondary)', flex: 1, fontSize: 10 }}>#{j.id.slice(0, 8)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{j.tokens.toLocaleString()} tok</span>
              <span style={{ color: j.status === 'completed' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 700, minWidth: 82, textAlign: 'right' }}>
                {j.status === 'completed' ? `+${j.earn} $LOCK` : '—'}
              </span>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}
