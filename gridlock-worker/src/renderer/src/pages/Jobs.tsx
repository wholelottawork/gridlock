import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

type Job = {
  id: string
  status: 'completed' | 'failed' | 'running'
  tokens: number
  earn: number
  tier: string
  duration_ms: number
  ts: number
}

function fmtAge(ts: number): string {
  const s = Math.floor((Date.now() - ts * 1000) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all')

  useEffect(() => {
    const gl = (window as unknown as { gridlock?: { worker: { jobs: () => Promise<{ jobs: Job[] }> } } }).gridlock
    if (!gl) return
    const poll = () => {
      gl.worker.jobs().then(r => setJobs(r.jobs as Job[])).catch(() => {})
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => clearInterval(iv)
  }, [])

  const visible = jobs.filter(j => filter === 'all' || j.status === filter)
  const totalEarn = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.earn, 0)
  const totalTok  = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.tokens, 0)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>Jobs</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TOTAL JOBS',    val: jobs.length.toString() },
          { label: 'COMPLETED',     val: jobs.filter(j => j.status === 'completed').length.toString() },
          { label: 'TOKENS SERVED', val: `${(totalTok / 1_000_000).toFixed(2)}M` },
          { label: 'TOTAL EARNED',  val: `${totalEarn.toFixed(4)} $LOCK` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {(['all', 'completed', 'failed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none',
            color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: filter === f ? '2px solid var(--text-primary)' : '2px solid transparent',
            marginBottom: -1, textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {visible.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
            No jobs yet — start the worker on the Dashboard.
          </div>
        ) : visible.map(j => (
          <div key={j.id} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 80px 80px 90px 70px',
            alignItems: 'center', padding: '9px 13px',
            borderBottom: '1px solid var(--border)', gap: 8, fontSize: 11,
          }}>
            <span style={{ color: j.status === 'completed' ? 'var(--success)' : 'var(--error)', fontWeight: 800 }}>
              {j.status === 'completed' ? '✓' : '✗'}
            </span>
            <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>#{j.id.slice(0, 12)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{j.tier ?? '—'}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{j.tokens.toLocaleString()} tok</span>
            <span style={{ fontWeight: 700, color: j.status === 'completed' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {j.status === 'completed' ? `+${j.earn}` : '—'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'right' }}>{fmtAge(j.ts)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
