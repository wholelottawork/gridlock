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

  const todayEarn  = history[history.length - 1]?.earn ?? 0
  const weekEarn   = history.reduce((s, d) => s + d.earn, 0)
  const apyDaily   = (staked * 0.08) / 365
  const maxBar     = Math.max(...history.map(d => d.earn))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 20 }}>Earnings</div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'TODAY',       val: `${todayEarn.toFixed(2)} $LOCK`,   sub: 'earned' },
          { label: 'THIS WEEK',   val: `${weekEarn.toFixed(2)} $LOCK`,    sub: 'earned' },
          { label: 'ALL TIME',    val: `${total.toFixed(2)} $LOCK`,        sub: 'total' },
          { label: 'STAKED',      val: `${staked.toLocaleString()} $LOCK`, sub: '8% APY' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div className="label" style={{ marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 3 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart — daily earnings */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 14 }}>DAILY EARNINGS (LAST 7 DAYS)</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={28}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', fontSize: 11, borderRadius: 4 }}
              formatter={(v: number) => [`${v} $LOCK`, 'Earned']}
            />
            <Bar dataKey="earn" radius={[3, 3, 0, 0]}>
              {history.map((d, i) => (
                <Cell key={i} fill={d.earn === maxBar ? 'var(--orange)' : 'rgba(255,107,53,0.35)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Staking section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 14 }}>STAKING</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Staked balance</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{staked.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>$LOCK</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>~{apyDaily.toFixed(2)} $LOCK/day APY</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Pending unstake</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: pendingUnstake > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
              {pendingUnstake.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>$LOCK</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>21-day cooldown</div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '8px 0', background: '#ffffff', color: '#000000', border: '1px solid #ffffff', borderRadius: 5, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            STAKE MORE
          </button>
          <button style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-2)', borderRadius: 5, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            UNSTAKE
          </button>
        </div>
      </div>

      {/* Penalty credits */}
      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>PENALTY CREDITS RECEIVED</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--orange)' }}>+3.21 $LOCK</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>from 4 worker penalties this week</div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
            <div>Auto-credited via</div>
            <div>PermanentDelegate</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
