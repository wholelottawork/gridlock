import { app } from 'electron'
import { existsSync } from 'fs'
import { join, delimiter as pathDelimiter } from 'path'

export function getPythonModuleDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'python')
    : join(process.cwd(), 'python')
}

export function getBundledPythonPath(): string | null {
  if (!app.isPackaged || process.platform !== 'win32') return null
  const exe = join(process.resourcesPath, 'python-runtime', 'python.exe')
  return existsSync(exe) ? exe : null
}

export function getPythonExecutable(): string {
  return getBundledPythonPath() ?? (process.platform === 'win32' ? 'python' : 'python3')
}

export function getDaemonScriptPath(): string {
  return join(getPythonModuleDir(), 'daemon.py')
}

export function isBundledPythonReady(): boolean {
  if (!app.isPackaged) return true
  if (process.platform !== 'win32') return true
  return getBundledPythonPath() !== null
}

/** Default model for packaged app — smaller/faster first download than 8b. */
export const PACKAGED_OLLAMA_MODEL = 'llama3.2:3b'

export function packagedDaemonEnv(settings: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...settings }
  const pyDir = getPythonModuleDir()
  env.PYTHONPATH = env.PYTHONPATH ? `${pyDir}${pathDelimiter}${env.PYTHONPATH}` : pyDir
  if (app.isPackaged && !env.GRIDLOCK_OLLAMA_MODEL) {
    env.GRIDLOCK_OLLAMA_MODEL = PACKAGED_OLLAMA_MODEL
  }
  return env
}
