const api = () => (window as unknown as { gridlock: { window: { minimize: () => void; maximize: () => void; close: () => void } } }).gridlock?.window

export default function TitleBar() {
  return (
    <div style={{
      height: 36,
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 16,
      flexShrink: 0,
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '1px' }}>
          GRIDLOCK WORKER
        </span>
      </div>

      {/* Window controls — not draggable */}
      <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {[
          { label: '─', action: () => api()?.minimize() },
          { label: '□', action: () => api()?.maximize() },
          { label: '✕', action: () => api()?.close() },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{
            width: 36, height: 36, background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
