import { useState } from 'react'
import { motion } from 'framer-motion'

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: sub ? 2 : 8 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{sub}</div>}
      {children}
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none',
      background: on ? 'var(--text-primary)' : 'var(--bg-4)',
      cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0
    }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: on ? '#000000' : 'var(--text-muted)',
        transition: 'left 0.2s'
      }} />
    </button>
  )
}

export default function Settings() {
  const [wallet, setWallet] = useState('')
  const [rpcUrl, setRpcUrl] = useState('https://api.devnet.solana.com')
  const [teeMode, setTeeMode] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [maxVram, setMaxVram] = useState('90')
  const [tier, setTier] = useState('Batch')
  const [saved, setSaved] = useState(false)

  const save = async () => {
    const gl = (window as unknown as { gridlock?: { settings: { save: (cfg: unknown) => Promise<{ ok: boolean }> } } }).gridlock
    const cfg = { wallet, rpcUrl, teeMode, autoStart, maxVramPct: Number(maxVram), tier }
    try { await gl?.settings.save(cfg) } catch {}
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 20 }}>Settings</div>

      {/* Wallet */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 14 }}>WALLET</div>
        <Field label="Wallet Public Key" sub="Your Solana wallet address. Earnings are sent here.">
          <input
            value={wallet}
            onChange={e => setWallet(e.target.value)}
            placeholder="Enter Solana wallet address…"
            className="mono"
            style={{ fontSize: 12 }}
          />
        </Field>
        <Field label="RPC Endpoint" sub="Solana RPC URL for chain interactions.">
          <input value={rpcUrl} onChange={e => setRpcUrl(e.target.value)} />
        </Field>
      </div>

      {/* Worker config */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 14 }}>WORKER</div>

        <Field label="Job Tier" sub="Minimum job tier to accept. Higher tiers pay more but require faster hardware.">
          <div style={{ display: 'flex', gap: 6 }}>
            {['Nano', 'Micro', 'Batch', 'Realtime'].map(t => (
              <button key={t} onClick={() => setTier(t)} style={{
                padding: '6px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700,
                border: `1px solid ${tier === t ? 'var(--text-primary)' : 'var(--border-2)'}`,
                background: tier === t ? '#ffffff' : 'rgba(255,255,255,0.04)',
                color: tier === t ? '#000000' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}>{t}</button>
            ))}
          </div>
        </Field>

        <Field label="Max VRAM Usage" sub="Percentage of GPU VRAM the worker can use.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="range" min={50} max={98} value={maxVram}
              onChange={e => setMaxVram(e.target.value)}
              style={{ flex: 1, accentColor: 'var(--orange)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{maxVram}%</span>
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>TEE / Confidential Mode</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Serve jobs inside a Trusted Execution Environment. Requires Intel TDX or AMD SEV hardware.</div>
          </div>
          <Toggle on={teeMode} onToggle={() => setTeeMode(v => !v)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>Start on Login</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Launch Gridlock Worker automatically when you log in.</div>
          </div>
          <Toggle on={autoStart} onToggle={() => setAutoStart(v => !v)} />
        </div>
      </div>

      {/* About */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>ABOUT</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Version</span>
            <span>0.1.0</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Network</span>
            <span>Solana Devnet</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Daemon port</span>
            <span className="mono">7420</span>
          </div>
        </div>
      </div>

      {/* Save */}
      <button onClick={save} style={{
        width: '100%', padding: '11px 0', borderRadius: 6, fontWeight: 800, fontSize: 13,
        background: saved ? 'rgba(34,197,94,0.12)' : '#ffffff',
        color: saved ? 'var(--green)' : '#000000',
        border: saved ? '1px solid var(--green)' : '1px solid #ffffff',
        cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.5px'
      }}>
        {saved ? 'SAVED ✓' : 'SAVE SETTINGS'}
      </button>
    </motion.div>
  )
}
