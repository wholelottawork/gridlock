import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'

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

function startDaemon(): void {
  const pythonScript = isDev
    ? join(process.cwd(), 'python', 'daemon.py')
    : join(process.resourcesPath, 'python', 'daemon.py')

  const pythonBin = process.platform === 'win32' ? 'python' : 'python3'

  try {
    daemon = spawn(pythonBin, [pythonScript, '--port', String(DAEMON_PORT)], {
      stdio: ['pipe', 'pipe', 'pipe']
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

// IPC
ipcMain.handle('daemon:status', () => fetchDaemon('/status').catch(() => ({ running: false, gpu: null })))
ipcMain.handle('worker:start',   () => fetchDaemon('/worker/start', 'POST').catch(() => ({ ok: false })))
ipcMain.handle('worker:stop',    () => fetchDaemon('/worker/stop', 'POST').catch(() => ({ ok: false })))
ipcMain.handle('worker:jobs',    () => fetchDaemon('/jobs').catch(() => ({ jobs: [] })))
ipcMain.handle('worker:earnings',() => fetchDaemon('/earnings').catch(() => ({ today: 0, week: 0, total: 0, history: [] })))
ipcMain.handle('settings:save',  (_e, cfg: unknown) => { console.log('[settings]', cfg); return { ok: true } })

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.restore() : mainWindow?.maximize())
ipcMain.handle('window:close',    () => mainWindow?.hide())

app.whenReady().then(() => {
  createWindow()
  createTray()
  startDaemon()
})

// Keep app alive in tray when all windows closed
app.on('window-all-closed', (e: Event) => e.preventDefault())
app.on('before-quit', () => { daemon?.kill(); daemon = null })
