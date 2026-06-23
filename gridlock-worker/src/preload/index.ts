import { contextBridge, ipcRenderer } from 'electron'

export type DaemonEvent = { event: string; [k: string]: unknown }
export type ComputeDevice = 'auto' | 'cpu' | 'gpu'

export type WorkerSettings = {
  wallet: string
  rpcUrl: string
  teeMode: boolean
  autoStart: boolean
  maxVramPct: number
  tier: string
  computeDevice: ComputeDevice
  gpuIndex: number
}

export type GPUInfo = {
  vendor?: string
  name: string
  index?: number
  vram_used_gb: number
  vram_total_gb: number
  utilization: number
  temperature: number
  power_w: number
  power_max_w: number
  detected?: boolean
  stats_available?: boolean
  cores?: number
  threads?: number
}

export type CPUInfo = {
  name: string
  cores: number
  threads: number
  detected?: boolean
}

const api = {
  daemon: {
    status: (): Promise<{
      running: boolean
      backend_ok?: boolean
      last_backend_error?: string | null
      wallet_connected?: boolean
      inference_ready?: boolean
      inference_error?: string | null
      inference_backend?: string | null
      worker_address?: string
      tee_capable?: boolean
      compute_mode?: ComputeDevice
      effective_compute?: ComputeDevice | 'gpu' | 'cpu'
      gpu_index?: number
      cpu?: CPUInfo | null
      gpus?: GPUInfo[]
      gpu_detected?: boolean
      gpu: GPUInfo | null
      active_job: unknown
      tokens_per_sec: number
      jobs_today: number
      earnings_today: number
    }> =>
      ipcRenderer.invoke('daemon:status'),
    onEvent: (cb: (e: DaemonEvent) => void) => {
      ipcRenderer.on('daemon:event', (_e, data) => cb(data as DaemonEvent))
      return () => ipcRenderer.removeAllListeners('daemon:event')
    }
  },
  worker: {
    start:    (): Promise<{ ok: boolean; error?: string; message?: string; inference_backend?: string }> =>
      ipcRenderer.invoke('worker:start'),
    stop:     (): Promise<{ ok: boolean }> => ipcRenderer.invoke('worker:stop'),
    jobs:     (): Promise<{ jobs: unknown[] }> => ipcRenderer.invoke('worker:jobs'),
    earnings: (): Promise<{ today: number; week: number; total: number; history: unknown[] }> =>
      ipcRenderer.invoke('worker:earnings')
  },
  settings: {
    load: (): Promise<WorkerSettings> => ipcRenderer.invoke('settings:load'),
    save: (cfg: WorkerSettings): Promise<{ ok: boolean }> => ipcRenderer.invoke('settings:save', cfg)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close')
  }
}

contextBridge.exposeInMainWorld('gridlock', api)
