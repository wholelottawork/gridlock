import { contextBridge, ipcRenderer } from 'electron'

export type DaemonEvent = { event: string; [k: string]: unknown }
export type GPUInfo = {
  name: string
  vram_used_gb: number
  vram_total_gb: number
  utilization: number
  temperature: number
  power_w: number
  power_max_w: number
}

const api = {
  daemon: {
    status: (): Promise<{ running: boolean; gpu: GPUInfo | null; active_job: unknown; tokens_per_sec: number; jobs_today: number; earnings_today: number }> =>
      ipcRenderer.invoke('daemon:status'),
    onEvent: (cb: (e: DaemonEvent) => void) => {
      ipcRenderer.on('daemon:event', (_e, data) => cb(data as DaemonEvent))
      return () => ipcRenderer.removeAllListeners('daemon:event')
    }
  },
  worker: {
    start:    (): Promise<{ ok: boolean }> => ipcRenderer.invoke('worker:start'),
    stop:     (): Promise<{ ok: boolean }> => ipcRenderer.invoke('worker:stop'),
    jobs:     (): Promise<{ jobs: unknown[] }> => ipcRenderer.invoke('worker:jobs'),
    earnings: (): Promise<{ today: number; week: number; total: number; history: unknown[] }> =>
      ipcRenderer.invoke('worker:earnings')
  },
  settings: {
    save: (cfg: unknown): Promise<{ ok: boolean }> => ipcRenderer.invoke('settings:save', cfg)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close')
  }
}

contextBridge.exposeInMainWorld('gridlock', api)
