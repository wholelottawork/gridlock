// Simulated live network data — replace with real Solana / API calls

export type SlaTier = "realtime" | "standard" | "batch" | "confidential";
export type WorkerRole = "Prefill" | "Decode" | "Cache" | "Router";
export type WorkerStatus = "Active" | "Paused" | "Draining" | "AutoGated";

export interface Worker {
  id: string;
  address: string;
  role: WorkerRole;
  status: WorkerStatus;
  reliabilityScore: number;
  slaPassRate: number;
  p99TtftMs: number;
  goodputScore: number;
  stakedLock: number;
  teeCapable: boolean;
  penaltiesPaid: number;
  hardwareTier: string;
  jobsToday: number;
  earningsToday: number;
  isConfidential: boolean;
}

export interface Job {
  id: string;
  customer: string;
  model: string;
  slaTier: SlaTier;
  ttftMs: number;
  tpotMs: number;
  slaMet: boolean;
  confidential: boolean;
  worker: string;
  ts: number;
  penaltyPaid?: number;
}

export interface NetworkStats {
  activeworkers: number;
  slaPassRate: number;
  p99TtftMs: number;
  totalPenaltiesPaid: number;
  requestsToday: number;
  confidentialShare: number;
  teeWorkers: number;
}

function rng(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function shortAddr() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const roles: WorkerRole[] = ["Prefill", "Decode", "Cache", "Router"];
const statuses: WorkerStatus[] = ["Active", "Active", "Active", "Paused"];
const hardware = ["RTX 4090", "RTX 3090", "A100 80G", "H100 SXM", "RTX 5090", "A6000"];

export function generateWorkers(n = 20): Worker[] {
  return Array.from({ length: n }, (_, i) => {
    const role = roles[i % 4];
    const score = Math.floor(rng(6500, 9900));
    return {
      id: `w${i}`,
      address: shortAddr(),
      role,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      reliabilityScore: score,
      slaPassRate: Math.floor(rng(8800, 9950)),
      p99TtftMs: Math.floor(rng(120, 480)),
      goodputScore: Math.floor(rng(200, 1800)),
      stakedLock: Math.floor(rng(5000, 80000)),
      teeCapable: Math.random() > 0.4,
      penaltiesPaid: Math.floor(rng(0, 500)),
      hardwareTier: hardware[Math.floor(Math.random() * hardware.length)],
      jobsToday: Math.floor(rng(800, 12000)),
      earningsToday: parseFloat(rng(12, 420).toFixed(2)),
      isConfidential: Math.random() > 0.6,
    };
  });
}

export function generateJobs(n = 30): Job[] {
  const models = ["llama-3.1-70b", "llama-3.1-8b", "mistral-7b", "qwen2.5-72b"];
  const tiers: SlaTier[] = ["realtime", "realtime", "standard", "batch", "confidential"];
  const workers = generateWorkers(10);

  return Array.from({ length: n }, (_, i) => {
    const tier = tiers[Math.floor(Math.random() * tiers.length)];
    const ttft = Math.floor(rng(80, 900));
    const limit = tier === "realtime" ? 300 : tier === "standard" ? 800 : tier === "batch" ? 5000 : 800;
    const met = ttft <= limit;
    const fee = parseFloat(rng(0.01, 0.5).toFixed(4));
    return {
      id: `job${i}${Math.random().toString(36).slice(2, 6)}`,
      customer: shortAddr().slice(0, 12),
      model: models[Math.floor(Math.random() * models.length)],
      slaTier: tier,
      ttftMs: ttft,
      tpotMs: Math.floor(rng(30, 150)),
      slaMet: met,
      confidential: tier === "confidential",
      worker: workers[Math.floor(Math.random() * workers.length)].address.slice(0, 8),
      ts: Date.now() - Math.floor(rng(0, 3600000)),
      penaltyPaid: met ? undefined : parseFloat((fee * (tier === "realtime" ? 2 : 0.5)).toFixed(4)),
    };
  });
}

export function getNetworkStats(): NetworkStats {
  return {
    activeworkers: Math.floor(rng(340, 410)),
    slaPassRate: parseFloat(rng(96.2, 99.4).toFixed(1)),
    p99TtftMs: Math.floor(rng(210, 290)),
    totalPenaltiesPaid: parseFloat(rng(12400, 18000).toFixed(0)),
    requestsToday: Math.floor(rng(480000, 620000)),
    confidentialShare: parseFloat(rng(18, 34).toFixed(1)),
    teeWorkers: Math.floor(rng(110, 160)),
  };
}
