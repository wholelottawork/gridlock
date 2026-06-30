import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/** Production Gridlock router — not user-configurable. Dev override: GRIDLOCK_BACKEND_URL env. */
export const GRIDLOCK_API_URL = (
  process.env.GRIDLOCK_BACKEND_URL ?? 'https://api.grid-lock.tech'
).replace(/\/$/, '')

/** Web app stake page — stake/unstake UI lives here, not in the worker. */
export const GRIDLOCK_STAKE_URL = (
  process.env.GRIDLOCK_STAKE_URL ?? 'https://grid-lock.tech/stake'
).replace(/\/$/, '')

export type ComputeDevice = 'auto' | 'cpu' | 'gpu'

export interface WorkerSettings {
  wallet: string
  rpcUrl: string
  teeMode: boolean
  autoStart: boolean
  maxVramPct: number
  tier: string
  computeDevice: ComputeDevice
  gpuIndex: number
}

const DEFAULTS: WorkerSettings = {
  wallet: '',
  rpcUrl: 'https://api.devnet.solana.com',
  teeMode: false,
  autoStart: false,
  maxVramPct: 90,
  tier: 'Batch',
  computeDevice: 'auto',
  gpuIndex: 0,
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): WorkerSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkerSettings & { backendUrl?: string }>
    delete parsed.backendUrl
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: WorkerSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}
