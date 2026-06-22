import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type DayData = { day: string; earn: number; jobs: number }

function mockHistory(): DayData[] {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map((day, i) => ({
    day,
    earn: +(4 + Math.random() * 18 + (i === 6 ? -8 : 0)).toFixed(2),
    jobs: Math.floor(60 + Math.random() * 120)
  }))
}

export default function Earnings() {
  const [history, setHistory] = useState<DayData[]>(mockHistory)
  const [total, setTotal] = useState(142.38)
  const [staked, setStaked] = useState(50_000)
  const [pendingUnstake, setPendingUnstake] = useState(0)

  useEffect(() => {
    const gl = (window as unknown as { gridlock?: { worker: { earnings: () => Promise<{ today: number; week: number; total: number; history: DayData[] }> } } }).gridlock
    if (!gl) return
    gl.worker.earnings().then(r => {
      if (r.total) setTotal(r.total)
      if (r.history?.length) setHistory(r.history)
    }).catch(() => {})
  }, [])

  const todayEarn = history[history.length - 1]?.earn ?? 0
  const weekEarn  = history.reduce((s, d) => s + d.earn, 0)
  const apyDaily  = (staked * 0.08) / 365
  const maxBar    = Math.max(...history.map(d => d.earn))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>Earnings</div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TODAY',     val: `${todayEarn.toFixed(2)} $LOCK`,    sub: 'earned' },
          { label: 'THIS WEEK', val: `${weekEarn.toFixed(2)} $LOCK`,     sub: 'earned' },
          { label: 'ALL TIME',  val: `${total.toFixed(2)} $LOCK`,         sub: 'total' },
          { label: 'STAKED',    val: `${staked.toLocaleString()} $LOCK`,  sub: '8% APY' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 3 }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>DAILY EARNINGS — LAST 7 DAYS</div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={26}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as DayData
                return (
                  <div style={{
                    background: '#111111',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    minWidth: 120,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#ffffff', marginBottom: 4 }}>{d.day}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#ffffff' }}>{d.earn} <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>$LOCK</span></div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{d.jobs} jobs</div>
                  </div>
                )
              }}
            />
            <Bar dataKey="earn" radius={[3, 3, 0, 0]}>
              {history.map((d, i) => (
                <Cell key={i} fill={d.earn === maxBar ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Staking */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>STAKING</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Staked balance</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{staked.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>$LOCK</span></div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 3 }}>~{apyDaily.toFixed(2)} $LOCK/day APY</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Pending unstake</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: pendingUnstake > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {pendingUnstake.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>$LOCK</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 3 }}>21-day cooldown</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '8px 0', background: 'var(--text-primary)', color: '#000000', border: '1px solid var(--text-primary)', borderRadius: 5, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            STAKE MORE
          </button>
          <button style={{ flex: 1, padding: '8px 0', background: 'var(--accent-dim)', color: 'var(--text-primary)', border: '1px solid var(--border-2)', borderRadius: 5, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            UNSTAKE
          </button>
        </div>
      </div>

      {/* Penalty credits */}
      <div className="card">
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>PENALTY CREDITS RECEIVED</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>+3.21 $LOCK</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 3 }}>from 4 worker penalties this week</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>
            <div>Auto-credited via</div>
            <div>PermanentDelegate</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
