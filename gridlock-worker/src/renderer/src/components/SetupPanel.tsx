import { useCallback, useEffect, useState } from 'react'

type SetupStatus = {
  pythonReady: boolean
  ollamaInstalled: boolean
  ollamaRunning: boolean
  modelReady: boolean
  modelName: string
  ready: boolean
}

type GridlockSetup = {
  check: () => Promise<SetupStatus>
  installOllama: () => Promise<{ ok: boolean; message?: string }>
  pullModel: () => Promise<{ ok: boolean; message?: string }>
  openOllamaDownload: () => Promise<{ ok: boolean }>
  onProgress: (cb: (data: { phase: string; line: string; model?: string }) => void) => () => void
}

function setupApi(): GridlockSetup | undefined {
  return (window as unknown as { gridlock?: { setup: GridlockSetup } }).gridlock?.setup
}

export default function SetupPanel() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState<'ollama' | 'model' | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = await setupApi()?.check()
    if (s) setStatus(s)
    return s
  }, [])

  useEffect(() => {
    void refresh()
    const iv = setInterval(() => void refresh(), 4000)
    return () => clearInterval(iv)
  }, [refresh])

  useEffect(() => {
    const api = setupApi()
    if (!api) return
    return api.onProgress((data) => {
      if (data.line) setProgress(data.line)
    })
  }, [])

  if (!status || status.ready) return null

  const installOllama = async () => {
    setBusy('ollama')
    setError(null)
    setProgress('Downloading Ollama installer…')
    try {
      const res = await setupApi()?.installOllama()
      if (!res?.ok) setError(res?.message ?? 'Ollama install failed.')
      else setProgress(null)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const pullModel = async () => {
    setBusy('model')
    setError(null)
    setProgress(`Downloading ${status.modelName}…`)
    try {
      const res = await setupApi()?.pullModel()
      if (!res?.ok) setError(res?.message ?? 'Model download failed.')
      else setProgress(null)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const step = (done: boolean, label: string, detail: string, action?: React.ReactNode) => (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: done ? 'var(--text-primary)' : 'var(--bg-4)',
        color: done ? '#000' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 900,
      }}>
        {done ? '✓' : '·'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{detail}</div>
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 14, border: '1px solid var(--border-2)' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        SETUP
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>One-time setup</div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 }}>
        Gridlock bundles its worker runtime. You only need Ollama and an AI model — we&apos;ll guide you through it.
      </p>

      {step(
        status.pythonReady,
        'Worker runtime',
        status.pythonReady ? 'Bundled Python is ready.' : 'Python runtime missing — reinstall Gridlock Worker.',
      )}

      {step(
        status.ollamaRunning,
        'Ollama (local AI engine)',
        status.ollamaRunning
          ? 'Ollama is running.'
          : status.ollamaInstalled
            ? 'Ollama is installed but not running. Open Ollama from the Start menu.'
            : 'Required to run models on your PC. One-click install (~200 MB).',
        !status.ollamaRunning && (
          <button
            type="button"
            onClick={() => void installOllama()}
            disabled={busy !== null}
            className={busy === 'ollama' ? 'btn-busy' : undefined}
            style={{
              padding: '8px 16px', borderRadius: 6, fontWeight: 800, fontSize: 11,
              background: busy === 'ollama' ? 'var(--accent-mid)' : 'var(--text-primary)',
              color: busy === 'ollama' ? 'var(--text-primary)' : '#000',
              border: '1px solid var(--border-2)', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy === 'ollama' ? 'INSTALLING OLLAMA…' : status.ollamaInstalled ? 'START OLLAMA' : 'INSTALL OLLAMA'}
          </button>
        ),
      )}

      {step(
        status.modelReady,
        `AI model (${status.modelName})`,
        status.modelReady
          ? 'Model ready.'
          : `First download is ~2 GB. Recommended default for most PCs.`,
        status.ollamaRunning && !status.modelReady && (
          <button
            type="button"
            onClick={() => void pullModel()}
            disabled={busy !== null}
            className={busy === 'model' ? 'btn-busy' : undefined}
            style={{
              padding: '8px 16px', borderRadius: 6, fontWeight: 800, fontSize: 11,
              background: busy === 'model' ? 'var(--accent-mid)' : 'var(--text-primary)',
              color: busy === 'model' ? 'var(--text-primary)' : '#000',
              border: '1px solid var(--border-2)', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy === 'model' ? 'DOWNLOADING MODEL…' : 'DOWNLOAD MODEL'}
          </button>
        ),
      )}

      {progress && (
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {progress}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--error)', fontWeight: 600, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  )
}
