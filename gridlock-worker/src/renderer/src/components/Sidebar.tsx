import type { Page } from '../App'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▣' },
  { id: 'jobs',      label: 'Jobs',      icon: '⚡' },
  { id: 'earnings',  label: 'Earnings',  icon: '◈' },
  { id: 'settings',  label: 'Settings',  icon: '◎' },
]

export default function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <nav style={{
      width: 188,
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{ flex: 1, paddingTop: 8 }}>
        {NAV.map(n => {
          const active = page === n.id
          return (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              background: active ? 'rgba(255,255,255,0.05)' : 'none',
              border: 'none',
              borderLeft: `2px solid ${active ? 'var(--orange)' : 'transparent'}`,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: active ? 700 : 400,
              cursor: 'pointer',
              textAlign: 'left',
              letterSpacing: '0.2px'
            }}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </button>
          )
        })}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-muted)',
        fontWeight: 700
      }}>
        gridlock.network
      </div>
    </nav>
  )
}
