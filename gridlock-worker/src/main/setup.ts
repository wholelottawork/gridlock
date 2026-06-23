import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { get } from 'https'
import { PACKAGED_OLLAMA_MODEL } from './python.js'

const OLLAMA_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe'
const OLLAMA_API = 'http://127.0.0.1:11434'

export type SetupStatus = {
  pythonReady: boolean
  ollamaInstalled: boolean
  ollamaRunning: boolean
  modelReady: boolean
  modelName: string
  ready: boolean
}

function ollamaExeCandidates(): string[] {
  const local = process.env.LOCALAPPDATA ?? ''
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  return [
    join(local, 'Programs', 'Ollama', 'ollama.exe'),
    join(pf, 'Ollama', 'ollama.exe'),
    'ollama',
  ]
}

export function findOllamaExecutable(): string | null {
  if (process.platform !== 'win32') return 'ollama'
  for (const candidate of ollamaExeCandidates()) {
    if (candidate === 'ollama') continue
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function ollamaApiOk(timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}

async function modelIsPulled(modelName: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const data = (await res.json()) as { models?: { name?: string }[] }
    const want = modelName.split(':')[0]
    return (data.models ?? []).some((m) => {
      const n = (m.name ?? '').split(':')[0]
      return n === want || (m.name ?? '').startsWith(modelName)
    })
  } catch {
    return false
  }
}

export async function checkSetup(): Promise<SetupStatus> {
  const modelName = PACKAGED_OLLAMA_MODEL
  const ollamaInstalled = process.platform !== 'win32' || findOllamaExecutable() !== null
  const ollamaRunning = await ollamaApiOk()
  const modelReady = ollamaRunning && await modelIsPulled(modelName)
  const pythonReady = !app.isPackaged || process.platform !== 'win32' || existsSync(
    join(process.resourcesPath, 'python-runtime', 'python.exe'),
  )

  return {
    pythonReady,
    ollamaInstalled,
    ollamaRunning,
    modelReady,
    modelName,
    ready: pythonReady && ollamaRunning && modelReady,
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fetchUrl = (u: string) => {
      get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          fetchUrl(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      }).on('error', reject)
    }
    fetchUrl(url)
  })
}

async function waitForOllama(maxMs = 120_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (await ollamaApiOk(3000)) return true
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

export function launchOllamaApp(): Promise<boolean> {
  return new Promise((resolve) => {
    const cli = findOllamaExecutable()
    if (!cli) {
      resolve(false)
      return
    }
    const gui = join(dirname(cli), 'Ollama.exe')
    const target = existsSync(gui) ? gui : cli
    try {
      const child = spawn(target, [], { detached: true, stdio: 'ignore' })
      child.unref()
      resolve(true)
    } catch {
      resolve(false)
    }
  })
}

export async function ensureOllamaRunning(): Promise<{ ok: boolean; message?: string }> {
  if (await ollamaApiOk(2000)) return { ok: true }

  if (findOllamaExecutable()) {
    await launchOllamaApp()
    const up = await waitForOllama(60_000)
    if (up) return { ok: true }
    return { ok: false, message: 'Open Ollama from the Start menu, then click Retry.' }
  }

  return installOllamaFresh()
}

async function installOllamaFresh(): Promise<{ ok: boolean; message?: string }> {
  if (process.platform !== 'win32') {
    await shell.openExternal('https://ollama.com/download')
    return { ok: false, message: 'Install Ollama from the browser, then return here.' }
  }

  const dir = join(tmpdir(), 'gridlock-worker')
  await mkdir(dir, { recursive: true })
  const installer = join(dir, 'OllamaSetup.exe')

  try {
    await downloadFile(OLLAMA_INSTALLER_URL, installer)
  } catch (e) {
    await shell.openExternal('https://ollama.com/download')
    return { ok: false, message: `Could not download Ollama. Install manually: ${String(e)}` }
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(installer, ['/VERYSILENT', '/NORESTART'], {
      detached: true,
      stdio: 'ignore',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`Ollama installer exited with code ${code}`))
    })
  })

  try { await unlink(installer) } catch { /* ignore */ }

  const up = await waitForOllama(180_000)
  if (!up) {
    return { ok: false, message: 'Ollama installed but not responding. Open Ollama from the Start menu, then retry.' }
  }
  return { ok: true }
}

export function pullOllamaModel(
  modelName: string,
  onLine: (line: string) => void,
): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const exe = findOllamaExecutable() ?? 'ollama'
    const child = spawn(exe, ['pull', modelName], { stdio: ['ignore', 'pipe', 'pipe'] })

    const handle = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (t) onLine(t)
      }
    }

    child.stdout?.on('data', handle)
    child.stderr?.on('data', handle)
    child.on('error', (err) => resolve({ ok: false, message: err.message }))
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, message: `Model download failed (exit ${code})` })
    })
  })
}

export function registerSetupHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('setup:check', () => checkSetup())

  ipcMain.handle('setup:installOllama', async () => ensureOllamaRunning())

  ipcMain.handle('setup:pullModel', async () => {
    const model = PACKAGED_OLLAMA_MODEL
    const win = getWindow()
    return pullOllamaModel(model, (line) => {
      win?.webContents.send('setup:progress', { phase: 'pull', line, model })
    })
  })

  ipcMain.handle('setup:openOllamaDownload', async () => {
    await shell.openExternal('https://ollama.com/download')
    return { ok: true }
  })
}
