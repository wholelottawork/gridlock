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
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const TIERS = ['Nano', 'Micro', 'Batch', 'Realtime']

function mockJob(i: number): Job {
  const tokens = [512, 1024, 2048, 4096][i % 4]
  const failed = Math.random() < 0.06
  return {
    id: Math.random().toString(16).slice(2, 10),
    status: failed ? 'failed' : 'completed',
    tokens,
    earn: failed ? 0 : +((tokens / 1_000_000) * 8.5).toFixed(4),
    tier: TIERS[i % 4],
    duration_ms: Math.floor(400 + Math.random() * 2200),
    ts: Date.now() - i * 45_000 - Math.random() * 30_000
  }
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>(() => Array.from({ length: 20 }, (_, i) => mockJob(i)))
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all')

  useEffect(() => {
    const gl = (window as unknown as { gridlock?: { worker: { jobs: () => Promise<{ jobs: Job[] }> } } }).gridlock
    if (!gl) return
    gl.worker.jobs().then(r => { if (r.jobs.length) setJobs(r.jobs as Job[]) }).catch(() => {})
  }, [])

  // New jobs trickle in
  useEffect(() => {
    const iv = setInterval(() => {
      if (Math.random() > 0.3) return
      setJobs(prev => [mockJob(0), ...prev.slice(0, 49)])
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const visible = jobs.filter(j => filter === 'all' || j.status === filter)
  const totalEarn = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.earn, 0)
  const totalTok  = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.tokens, 0)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 20 }}>Jobs</div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'TOTAL JOBS',    val: jobs.length.toString() },
          { label: 'COMPLETED',     val: jobs.filter(j => j.status === 'completed').length.toString() },
          { label: 'TOKENS SERVED', val: `${(totalTok / 1_000_000).toFixed(2)}M` },
          { label: 'TOTAL EARNED',  val: `${totalEarn.toFixed(2)} $LOCK` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div className="label" style={{ marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['all', 'completed', 'failed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${filter === f ? 'var(--orange)' : 'transparent'}`,
            color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            textTransform: 'capitalize'
          }}>
            {f === 'all' ? `All (${jobs.length})` : f === 'completed' ? `Completed (${jobs.filter(j => j.status === 'completed').length})` : `Failed (${jobs.filter(j => j.status === 'failed').length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Status', 'Job ID', 'Tier', 'Tokens', 'Duration', 'Earned', 'Age'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 9, letterSpacing: '1px', color: 'var(--text-muted)' }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 30).map((j, i) => (
              <motion.tr key={j.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i < 5 ? i * 0.04 : 0 }}
                style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                    background: j.status === 'completed' ? 'var(--green-dim)' : j.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'var(--orange-dim)',
                    color: j.status === 'completed' ? 'var(--green)' : j.status === 'failed' ? 'var(--red)' : 'var(--orange)'
                  }}>
                    {j.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>#{j.id.slice(0,8)}</span>
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--text-secondary)' }}>{j.tier}</td>
                <td style={{ padding: '9px 14px', fontWeight: 700 }}>{j.tokens.toLocaleString()}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{j.duration_ms}ms</td>
                <td style={{ padding: '9px 14px', color: 'var(--orange)', fontWeight: 700 }}>
                  {j.status === 'completed' ? `+${j.earn} $LOCK` : '—'}
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{fmtAge(j.ts)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
