import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { loadSettings, saveSettings, GRIDLOCK_API_URL, type WorkerSettings } from './settings.js'
import { getDaemonScriptPath, getPythonExecutable, packagedDaemonEnv } from './python.js'
import { registerSetupHandlers } from './setup.js'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let daemon: ChildProcess | null = null
const DAEMON_PORT = 7420

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 880,
    minHeight: 580,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    { label: 'Show Gridlock Worker', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit() } }
  ])
  tray.setToolTip('Gridlock Worker')
  tray.setContextMenu(menu)
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function stopDaemon(): void {
  if (!daemon) return
  daemon.kill()
  daemon = null
}

function startDaemon(settings = loadSettings()): void {
  stopDaemon()

  const pythonScript = getDaemonScriptPath()
  const pythonBin = getPythonExecutable()
  const args = [
    pythonScript,
    '--port', String(DAEMON_PORT),
    '--backend', GRIDLOCK_API_URL,
  ]
  if (settings.wallet.trim()) {
    args.push('--wallet', settings.wallet.trim())
  }
  if (settings.teeMode) {
    args.push('--tee')
  }
  args.push('--compute', settings.computeDevice)
  args.push('--gpu-index', String(settings.gpuIndex ?? 0))

  try {
    daemon = spawn(pythonBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: packagedDaemonEnv({
        GRIDLOCK_BACKEND_URL: GRIDLOCK_API_URL,
        GRIDLOCK_WALLET: settings.wallet,
        GRIDLOCK_TEE: settings.teeMode ? 'true' : 'false',
        GRIDLOCK_COMPUTE_DEVICE: settings.computeDevice,
        GRIDLOCK_GPU_INDEX: String(settings.gpuIndex ?? 0),
      }),
    })

    daemon.stdout?.on('data', (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          const msg = JSON.parse(t)
          mainWindow?.webContents.send('daemon:event', msg)
        } catch { /* not JSON */ }
      }
    })

    daemon.stderr?.on('data', (buf: Buffer) => {
      console.error('[daemon]', buf.toString().trim())
    })

    daemon.on('exit', (code) => {
      console.log('[daemon] exit', code)
      daemon = null
    })
  } catch (e) {
    console.error('[daemon] failed to start:', e)
  }
}

async function fetchDaemon(path: string, method = 'GET'): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}${path}`, { method })
  return res.json()
}

function isValidWallet(wallet: string): boolean {
  const w = wallet.trim()
  return w.length >= 32 && w.length <= 64
}

// IPC
ipcMain.handle('daemon:status', () => fetchDaemon('/status').catch(() => ({ running: false, gpu: null })))
ipcMain.handle('worker:start', async () => {
  const settings = loadSettings()
  if (!isValidWallet(settings.wallet)) {
    return { ok: false, error: 'wallet_required', message: 'Connect your wallet before starting.' }
  }
  return fetchDaemon('/worker/start', 'POST').catch(() => ({ ok: false, error: 'daemon_unreachable' }))
})
ipcMain.handle('worker:stop',    () => fetchDaemon('/worker/stop', 'POST').catch(() => ({ ok: false })))
ipcMain.handle('worker:jobs',    () => fetchDaemon('/jobs').catch(() => ({ jobs: [] })))
ipcMain.handle('worker:earnings',() => fetchDaemon('/earnings').catch(() => ({ today: 0, week: 0, total: 0, history: [] })))
ipcMain.handle('settings:load', () => loadSettings())
async function syncWalletToDaemon(wallet: string): Promise<boolean> {
  if (!isValidWallet(wallet)) return false
  try {
    const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.trim() }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function syncConfigToDaemon(settings: WorkerSettings): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compute_device: settings.computeDevice,
        gpu_index: settings.gpuIndex ?? 0,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

ipcMain.handle('settings:save', async (_e, cfg: WorkerSettings) => {
  saveSettings(cfg)
  const syncedWallet = await syncWalletToDaemon(cfg.wallet)
  const syncedConfig = await syncConfigToDaemon(cfg)
  if (!syncedWallet || !syncedConfig) startDaemon(cfg)
  return { ok: true }
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.restore() : mainWindow?.maximize())
ipcMain.handle('window:close',    () => mainWindow?.hide())

registerSetupHandlers(() => mainWindow)

app.whenReady().then(() => {
  createWindow()
  createTray()
  startDaemon()
})

app.on('window-all-closed', (e: Event) => e.preventDefault())
app.on('before-quit', () => { stopDaemon() })
