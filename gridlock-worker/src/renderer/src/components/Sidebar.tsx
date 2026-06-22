import type { Page } from '../App'

const NAV: { id: Page; label: string; icon: JSX.Element }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8" y="1" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="1" y="8" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8" y="8" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="1.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 5.5h7M4 7.5h7M4 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'earnings',
    label: 'Earnings',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M1 13h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="2" y="8" width="2.5" height="5" rx="0.5" fill="currentColor" opacity="0.5"/>
        <rect x="6.25" y="5" width="2.5" height="8" rx="0.5" fill="currentColor" opacity="0.7"/>
        <rect x="10.5" y="2" width="2.5" height="11" rx="0.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M1 4h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5 7.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="3" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 11h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="12" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
]

export default function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <nav style={{
      width: 180,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ flex: 1, padding: '6px 8px' }}>
        {NAV.map(n => {
          const active = page === n.id
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                marginBottom: 2,
                background: active ? 'var(--bg-3)' : 'none',
                border: 'none',
                borderRadius: 7,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--bg-3)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
              <span style={{ opacity: active ? 1 : 0.45, flexShrink: 0, display: 'flex' }}>
                {n.icon}
              </span>
              {n.label}
            </button>
          )
        })}
      </div>

      <div style={{
        padding: '12px 18px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
      }}>
        gridlock.network · v0.1
      </div>
    </nav>
  )
}
