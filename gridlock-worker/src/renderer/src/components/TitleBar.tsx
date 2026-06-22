const win = () => (window as unknown as { gridlock?: { window: { minimize: () => void; maximize: () => void; close: () => void } } }).gridlock?.window

export default function TitleBar() {
  return (
    <div style={{
      height: 38,
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      <div style={{ width: 180, display: 'flex', alignItems: 'center', paddingLeft: 16, gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="5.5" height="5.5" rx="1.5" fill="var(--orange)" opacity="0.9"/>
          <rect x="8" y="0.5" width="5.5" height="5.5" rx="1.5" fill="var(--bg-5)"/>
          <rect x="0.5" y="8" width="5.5" height="5.5" rx="1.5" fill="var(--bg-5)"/>
          <rect x="8" y="8" width="5.5" height="5.5" rx="1.5" fill="var(--bg-5)"/>
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '1.2px' }}>
          GRIDLOCK
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', WebkitAppRegion: 'no-drag', paddingRight: 6, gap: 1 } as React.CSSProperties}>
        {([
          { fn: () => win()?.minimize(), title: 'Minimize', path: 'M4 7h6', stroke: 'currentColor' },
          { fn: () => win()?.maximize(), title: 'Maximize', path: 'M4 4h6v6H4z', stroke: 'currentColor' },
          { fn: () => win()?.close(),    title: 'Close',    path: 'M4 4l6 6M10 4L4 10', stroke: 'currentColor' },
        ] as const).map(({ fn, title, path, stroke }) => (
          <button key={title} onClick={fn} title={title} style={{
            width: 28, height: 28, background: 'none', border: 'none',
            borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.55, transition: 'opacity 0.1s, background 0.1s',
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-4)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.background = 'none' }}
          >
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <path d={path} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
