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
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>Jobs</div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TOTAL JOBS',    val: jobs.length.toString() },
          { label: 'COMPLETED',     val: jobs.filter(j => j.status === 'completed').length.toString() },
          { label: 'TOKENS SERVED', val: `${(totalTok / 1_000_000).toFixed(2)}M` },
          { label: 'TOTAL EARNED',  val: `${totalEarn.toFixed(2)} $LOCK` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {(['all', 'completed', 'failed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${filter === f ? 'var(--text-primary)' : 'transparent'}`,
            color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
            marginBottom: -1,
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
                <th key={h} style={{ padding: '9px 13px', textAlign: 'left', fontSize: 8.5, fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
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
                <td style={{ padding: '9px 13px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                    background: j.status === 'completed' ? 'rgba(255,255,255,0.07)' : j.status === 'failed' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                    color: j.status === 'completed' ? 'var(--text-primary)' : j.status === 'failed' ? 'var(--text-muted)' : 'var(--text-secondary)',
                    border: `1px solid ${j.status === 'completed' ? 'var(--border-2)' : 'var(--border)'}`,
                  }}>
                    {j.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '9px 13px' }}>
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>#{j.id.slice(0, 8)}</span>
                </td>
                <td style={{ padding: '9px 13px', color: 'var(--text-secondary)' }}>{j.tier}</td>
                <td style={{ padding: '9px 13px', fontWeight: 700 }}>{j.tokens.toLocaleString()}</td>
                <td style={{ padding: '9px 13px', color: 'var(--text-muted)' }}>{j.duration_ms}ms</td>
                <td style={{ padding: '9px 13px', fontWeight: 700 }}>
                  {j.status === 'completed' ? `+${j.earn} $LOCK` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ padding: '9px 13px', color: 'var(--text-muted)' }}>{fmtAge(j.ts)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
