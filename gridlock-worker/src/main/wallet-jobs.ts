import { GRIDLOCK_API_URL } from './settings.js'

export type WorkerJob = {
  id: string
  status: 'completed' | 'failed' | 'running'
  tokens: number
  earn: number
  tier: string
  duration_ms: number
  ts: number
}

function mapBackendJob(row: Record<string, unknown>): WorkerJob {
  const statusRaw = String(row.status ?? 'settled')
  const slaMet = row.sla_met !== false
  const status: WorkerJob['status'] =
    statusRaw === 'running' || statusRaw === 'in_progress'
      ? 'running'
      : statusRaw === 'failed' || !slaMet
        ? 'failed'
        : 'completed'

  const tokens = Number(row.completion_tokens ?? 0)
  const ttft = Number(row.ttft_ms ?? 0)
  const tpot = Number(row.tpot_ms ?? 0)

  return {
    id: String(row.id),
    status,
    tokens,
    earn: Number(row.fee ?? 0),
    tier: String(row.sla_tier ?? 'standard'),
    duration_ms: ttft + tpot * Math.max(tokens, 1),
    ts: Number(row.ts ?? 0),
  }
}

export async function fetchWalletJobs(wallet: string, limit = 50): Promise<WorkerJob[]> {
  const url = `${GRIDLOCK_API_URL}/v1/jobs?worker=${encodeURIComponent(wallet)}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { jobs?: Record<string, unknown>[] }
  return (data.jobs ?? []).map(mapBackendJob)
}

/** Prefer API history; overlay local session jobs (running + not yet indexed). */
export function mergeWalletJobs(remote: WorkerJob[], local: WorkerJob[], limit = 50): WorkerJob[] {
  const byId = new Map<string, WorkerJob>()
  for (const job of remote) byId.set(job.id, job)
  for (const job of local) {
    if (job.status === 'running' || !byId.has(job.id)) {
      byId.set(job.id, job)
    }
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, limit)
}
