"use client";
import { useState } from "react";
import { motion } from "framer-motion";

type Section = "quickstart" | "api" | "sdk" | "sla" | "workers" | "architecture" | "programs";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "quickstart",   label: "Quick Start" },
  { id: "api",          label: "REST API" },
  { id: "sdk",          label: "SDK / OpenAI Compat" },
  { id: "sla",          label: "SLA & Penalties" },
  { id: "workers",      label: "Running a Worker" },
  { id: "architecture", label: "Architecture" },
  { id: "programs",     label: "On-Chain Programs" },
];

function Code({ children, language = "bash" }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <div style={{ background: "var(--bg-0)", borderRadius: 6, padding: "14px 16px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "var(--text-secondary)", overflowX: "auto" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 10, position: "absolute", top: 8, left: 12 }}>{language}</span>
        <button onClick={copy} style={{ position: "absolute", top: 8, right: 12, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", color: copied ? "var(--green)" : "var(--text-muted)", fontWeight: 700 }}>
          {copied ? "Copied!" : "Copy"}
        </button>
        <pre style={{ margin: "18px 0 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</pre>
      </div>
    </div>
  );
}

function H2({ children }: { children: string }) {
  return <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12, marginTop: 24, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>{children}</div>;
}

function H3({ children }: { children: string }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "var(--orange)", marginBottom: 8, marginTop: 16 }}>{children}</div>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>{children}</p>;
}

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 14 }}>
      <table className="data-table">
        <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>
          {rows.map(([f, t, d]) => (
            <tr key={f}>
              <td style={{ fontFamily: "monospace", color: "var(--orange)", fontSize: 12 }}>{f}</td>
              <td style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{t}</td>
              <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS_CONTENT: Record<Section, React.ReactNode> = {
  quickstart: (
    <div>
      <H2>Quick Start</H2>
      <P>Gridlock exposes an OpenAI-compatible REST API. Drop in your existing OpenAI SDK and add the <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>gridlock</code> options object to control SLA tier and privacy.</P>

      <H3>1. Install</H3>
      <Code language="bash">{`npm install openai`}</Code>

      <H3>2. Send your first request</H3>
      <Code language="typescript">{`import OpenAI from 'openai'

const gridlock = new OpenAI({
  baseURL: 'https://api.grid-lock.tech/v1',  // or http://localhost:8080/v1 locally
  apiKey: 'your-gridlock-api-key',
})

const res = await gridlock.chat.completions.create({
  model: 'llama-3.1-8b-instant',
  messages: [{ role: 'user', content: 'Hello!' }],
  // Gridlock extension — passed transparently through OpenAI SDK
  // @ts-expect-error gridlock extension
  gridlock: {
    sla: 'realtime',   // 'realtime' | 'standard' | 'batch' | 'confidential'
    privacy: false,    // true = TEE-only workers
  },
})

// Standard OpenAI response
console.log(res.choices[0].message.content)

// Gridlock SLA metadata (in res.gridlock)
const meta = (res as any).gridlock
console.log(\`TTFT: \${meta.ttft_ms}ms, SLA \${meta.sla_met ? 'MET' : 'MISSED'}\`)
if (!meta.sla_met) {
  console.log(\`Penalty: \${meta.penalty_due_lock} LOCK credited to your wallet\`)
}`}</Code>

      <H3>3. Get an API key</H3>
      <P>API keys are available in the <strong>Console → API Keys</strong> tab. Each key can be scoped to a specific SLA tier and optionally restricted by IP. Rate limits scale with your staked LOCK balance.</P>

      <H3>4. SLA tiers at a glance</H3>
      <Table rows={[
        ["realtime",     "< 300ms TTFT", "Streaming interactive apps. 2× penalty on miss."],
        ["standard",     "< 800ms TTFT", "Most API use cases. 1× penalty on miss."],
        ["batch",        "< 5s TTFT",    "Offline processing. 0.25× penalty on miss."],
        ["confidential", "< 800ms + TEE","Private inference inside NVIDIA CC / AMD SEV. 1× + slash."],
      ]} />
    </div>
  ),

  api: (
    <div>
      <H2>REST API Reference</H2>
      <P>Base URL: <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>http://localhost:8080</code> (local) · <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>https://api.grid-lock.tech</code> (production)</P>
      <P>All endpoints accept and return JSON. Authenticated endpoints require <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>Authorization: Bearer {"{"}api-key{"}"}</code>.</P>

      <H3>POST /v1/chat/completions</H3>
      <P>OpenAI-compatible chat completions. Supports streaming (<code style={{ fontFamily: "monospace" }}>stream: true</code>) and the <code style={{ fontFamily: "monospace" }}>gridlock</code> options extension.</P>
      <Code language="json">{`// Request body
{
  "model": "llama-3.1-8b-instant",
  "messages": [{ "role": "user", "content": "..." }],
  "stream": false,
  "max_tokens": 512,
  "gridlock": {
    "sla": "standard",
    "privacy": false
  }
}

// Response (non-streaming)
{
  "id": "chatcmpl-uuid",
  "object": "chat.completion",
  "choices": [{ "message": { "role": "assistant", "content": "..." } }],
  "gridlock": {
    "job_id": "uuid",
    "ttft_ms": 187,
    "tpot_ms": 14,
    "sla_tier": "standard",
    "sla_met": true,
    "sla_target_ttft_ms": 800,
    "worker": "7xKm...b3Rq",
    "penalty_due_lock": null,
    "fee_lock": 0.0024
  }
}`}</Code>

      <H3>GET /v1/workers</H3>
      <P>List active GPU workers with performance metrics.</P>
      <Table rows={[
        ["role",            "string", "Prefill | Decode | Cache | Router"],
        ["status",          "string", "Active | Paused | AutoGated"],
        ["sla_tiers",       "string[]","Accepted SLA tiers"],
        ["goodput_score",   "number", "Requests/s within SLA (primary ranking metric)"],
        ["reliability_score","number","0–10000 EMA score"],
        ["sla_pass_rate",   "number", "Percentage of SLA requirements met"],
        ["tee_capable",     "bool",   "Worker supports TEE / confidential jobs"],
        ["staked_lock",     "number", "LOCK staked as SLA collateral"],
      ]} />

      <H3>GET /v1/jobs</H3>
      <P>Query completed inference jobs. Supports filtering by <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>sla_tier</code>, <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>sla_met</code>, and <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>worker</code>.</P>

      <H3>GET /v1/network/stats</H3>
      <Code language="json">{`{
  "active_workers": 16,
  "tee_workers": 6,
  "sla_pass_rate": 98.7,
  "p99_ttft_ms": 245,
  "total_penalties_lock": 182.4,
  "lock_burned": 12.8,
  "cache_hit_entries": 340,
  "requests_today": 48291
}`}</Code>

      <H3>GET /v1/leaderboard</H3>
      <P>Worker leaderboard sorted by <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>goodput</code>, <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>reliability</code>, <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>confidential</code>, or <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>earnings</code>. Returns GridPoints pre-computed per worker.</P>

      <H3>GET /v1/live (SSE)</H3>
      <P>Real-time event stream. Each settled job emits a JSON event with <code style={{ fontFamily: "monospace" }}>type: "job"</code> containing SLA outcome, TTFT, and any penalty.</P>
    </div>
  ),

  sdk: (
    <div>
      <H2>SDK / OpenAI Compatibility</H2>
      <P>Gridlock is a drop-in replacement for OpenAI. Any library that supports a custom <code style={{ fontFamily: "monospace" }}>baseURL</code> works without changes. The <code style={{ fontFamily: "monospace" }}>gridlock</code> options object is passed through transparently.</P>

      <H3>Python (openai SDK)</H3>
      <Code language="python">{`from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="your-gridlock-key",
)

response = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Explain KV-cache in 1 sentence."}],
    extra_body={"gridlock": {"sla": "realtime", "privacy": False}},
)

print(response.choices[0].message.content)
meta = response.model_extra["gridlock"]
print(f"TTFT {meta['ttft_ms']}ms · SLA {'MET' if meta['sla_met'] else 'MISS'}")`}</Code>

      <H3>cURL</H3>
      <Code language="bash">{`curl http://localhost:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-key" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello"}],
    "gridlock": {"sla": "standard"}
  }'`}</Code>

      <H3>Streaming (SSE)</H3>
      <Code language="typescript">{`const res = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: 'Tell me a story' }],
    stream: true,
    gridlock: { sla: 'realtime' },
  }),
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value)
  // chunk is "data: {...}\n\n" — parse delta.content
  for (const line of chunk.split('\\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const data = JSON.parse(line.slice(6))
    process.stdout.write(data.choices[0].delta.content ?? '')
  }
}`}</Code>

      <H3>x402 Agent Pay-Per-Call</H3>
      <P>Gridlock supports the x402 protocol for autonomous agent payments. Agents can self-fund inference calls without pre-funded API keys — payment is deducted per-request from the agent wallet using LOCK. Coming Q3 2025.</P>
    </div>
  ),

  sla: (
    <div>
      <H2>SLA Tiers &amp; Penalties</H2>
      <P>Every inference request is tracked against latency targets. When a worker misses the SLA, the penalty is automatically transferred from the worker&apos;s staked LOCK to the customer&apos;s wallet using Token-2022 PermanentDelegate — no dispute needed.</P>

      <H3>Tier targets</H3>
      <Table rows={[
        ["Realtime",     "TTFT < 300ms, TPOT < 60ms",  "2× job fee penalty on miss"],
        ["Standard",     "TTFT < 800ms, TPOT < 120ms", "1× job fee penalty on miss"],
        ["Batch",        "TTFT < 5000ms",               "0.25× job fee penalty on miss"],
        ["Confidential", "TTFT < 800ms + TEE proof",    "1× fee + reputation slash"],
      ]} />

      <H3>How PermanentDelegate works</H3>
      <P>When workers register, their staked LOCK token account grants PermanentDelegate authority to the SLAEnforcer PDA. On every SLA miss, the SLAEnforcer calls <code style={{ fontFamily: "monospace", color: "var(--orange)" }}>transfer_checked</code> to move the penalty amount from the worker stake account directly to the customer wallet — no worker signature required.</P>
      <P>This is trustless: the customer receives the penalty in the same transaction that settles the job. There is no claims process.</P>

      <H3>Watcher nodes</H3>
      <P>A random 5% of jobs are independently sampled by watcher nodes that measure TTFT from the network edge. If the watcher&apos;s measurement disagrees with the router&apos;s reported TTFT by more than 50ms, a dispute is raised on-chain via <code style={{ fontFamily: "monospace" }}>SLARegistry.sample_verify()</code>. The dishonest party (router or watcher) loses staked LOCK.</P>

      <H3>Receipt lifecycle</H3>
      <Code language="text">{`Customer sends request
        ↓
Router selects Prefill + Decode workers
        ↓
Job escrow funded in JobScheduler (LOCK locked)
        ↓
Inference runs → TTFT measured
        ↓
Router commits LatencyReceipt on-chain (SLARegistry)
        ↓
Watcher samples (5% probability)
    ├── Agrees → receipt finalized immediately
    └── Disagrees → dispute, dishonest party slashed
        ↓
Challenge window: 5 minutes
    └── No challenge → finalize_unchallenged()
        ↓
SLAEnforcer.settle_or_penalize()
    ├── SLA met → escrow → FeeCollector (60/20/10/10 split)
    └── SLA miss → penalty via PermanentDelegate → customer
        ↓
FeeCollector.distribute_fees() → stakers / worker / burn / treasury`}</Code>
    </div>
  ),

  workers: (
    <div>
      <H2>Running a Worker</H2>
      <P>Workers are GPU nodes that serve inference requests. To participate in Gridlock, you need: a supported GPU, a Solana wallet with staked LOCK (collateral), and an inference endpoint (vLLM or Groq-compatible API).</P>

      <H3>Hardware requirements</H3>
      <Table rows={[
        ["Consumer",   "RTX 3090 / RTX 4090",  "Batch + Standard tiers"],
        ["Prosumer",   "RTX 5090 / A6000",      "Standard + Realtime tiers"],
        ["DataCenter", "A100 80G",              "All tiers including Confidential"],
        ["Enterprise", "H100 SXM / H100 NVL",  "All tiers, highest goodput"],
      ]} />

      <H3>1. Start your inference endpoint</H3>
      <Code language="bash">{`# Using vLLM (recommended)
pip install vllm
python -m vllm.entrypoints.openai.api_server \\
  --model meta-llama/Llama-3.1-8B-Instruct \\
  --host 0.0.0.0 --port 8000

# Or using Groq API as backend (fastest setup)
export VLLM_ENDPOINT=https://api.groq.com/openai
export VLLM_API_KEY=your-groq-key`}</Code>

      <H3>2. Register your worker</H3>
      <Code language="bash">{`# Register via REST API (auto-posts to ProviderRegistry on-chain)
curl -X POST http://localhost:8080/v1/workers/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "operator_pubkey": "YourSolanaWallet...",
    "role": "Prefill",
    "hardware_tier": "RTX 4090",
    "tee_capable": false,
    "endpoint": "http://your-ip:8000"
  }'`}</Code>

      <H3>3. Send heartbeats</H3>
      <Code language="bash">{`# Send heartbeat every 30 seconds to stay Active
curl -X POST http://localhost:8080/v1/workers/heartbeat \\
  -d '{"worker_address": "YourAddress...", "goodput_score": 847}'

# Workers that miss 2 consecutive heartbeats (120s) are AutoGated
# AutoGated workers cannot receive new jobs until heartbeat resumes`}</Code>

      <H3>4. Stake LOCK collateral</H3>
      <P>Workers must stake LOCK as collateral to accept SLA tiers. Minimum collateral per tier:</P>
      <Table rows={[
        ["Batch",        "1,000 LOCK",  "< 5s TTFT"],
        ["Standard",     "5,000 LOCK",  "< 800ms TTFT"],
        ["Realtime",     "15,000 LOCK", "< 300ms TTFT"],
        ["Confidential", "20,000 LOCK", "< 800ms TTFT + TEE attestation"],
      ]} />

      <H3>Earnings</H3>
      <P>Workers earn 20% of each job fee. Additional revenue comes from the staker pool (8% APY on staked LOCK). The <strong>GridPoints Leaderboard</strong> tracks goodput and reliability — GridPoints convert to LOCK at TGE at a rate of 34% of total supply allocated to worker rewards.</P>
    </div>
  ),

  architecture: (
    <div>
      <H2>Architecture</H2>

      <H3>Request flow</H3>
      <Code language="text">{`Customer / AI Agent
        │
        │ POST /v1/chat/completions
        ▼
  ┌─────────────────────────────────────┐
  │         Gridlock Router             │
  │  Hono / TypeScript — port 8080      │
  │                                     │
  │  1. Auth check (API key)            │
  │  2. KV-cache prefix lookup (Redis)  │
  │  3. Pick Prefill worker             │
  │     (role=Prefill, sla_tier match)  │
  │  4. Forward to worker endpoint      │
  │  5. Measure TTFT                    │
  │  6. Commit receipt on-chain         │
  └─────────────────────────────────────┘
        │                     │
  ┌─────────┐          ┌──────────────┐
  │ vLLM /  │          │  Solana      │
  │ Groq    │          │  SLARegistry │
  │ Worker  │          │  SLAEnforcer │
  │ Node    │          │  JobScheduler│
  └─────────┘          └──────────────┘`}</Code>

      <H3>Disaggregated Prefill / Decode</H3>
      <P>Long-context requests are split between worker roles:</P>
      <Table rows={[
        ["Prefill",  "Context processing → first token",    "Compute-bound. High FLOPS, lower memory."],
        ["Decode",   "KV-cache continuation → token stream","Memory-bound. High HBM bandwidth."],
        ["Cache",    "KV-cache prefix storage",             "Stores shared prefixes (system prompts)."],
        ["Router",   "Request routing + SLA enforcement",   "No inference — orchestration only."],
      ]} />

      <H3>KV-cache prefix routing</H3>
      <P>Every prompt is hashed (SHA-256, first 256 chars). If a matching prefix exists in Redis, the request is routed to the worker that last processed it (warm path). Cache entries expire after 1 hour.</P>

      <H3>Watcher nodes</H3>
      <P>Staked watcher nodes independently measure TTFT for 5% of requests. Watchers earn fees for accurate measurements and are slashed for false disputes. This creates a trustless verification layer without requiring every request to be verified.</P>
    </div>
  ),

  programs: (
    <div>
      <H2>On-Chain Programs</H2>
      <P>Gridlock uses six Anchor programs on Solana. All programs use Token-2022 for LOCK operations.</P>

      <H3>Program addresses (devnet)</H3>
      <Table rows={[
        ["ProviderRegistry", "BY2igYfuWznssCoBGf2Xv1RNniMz9bJs4eMhbCG7JTaX", "Worker registration and reputation"],
        ["JobScheduler",     "CQy19zhExHRE8AEe7WwN4e2A8iZM3MJBtYavCj4JGfcp", "Job escrow and assignment"],
        ["SLARegistry",      "5Ry7qmpqXvjGyyXXeESUq61T2Y6AkmXHEedwkcNXv3oL", "Latency receipts and watcher verification"],
        ["SLAEnforcer",      "714he4Q3tN95jPAjFZP2tTofqkyzdwTcU9GEMCdNuZBa", "PermanentDelegate penalty execution"],
        ["FeeCollector",     "AYpC3BvP95v9d2PxgoY3C51f2LtBtWTwK7aDuoFr25Go", "60/20/10/10 revenue distribution + epoch APY"],
        ["Governance",       "GVT3q8FTtNKVmFnVoZAnKqGJYcf2mJ9YVAjcPGJnCsRT", "On-chain parameter voting + time-lock execution"],
      ]} />

      <H3>LOCK Token-2022</H3>
      <P>LOCK uses three Token-2022 extensions:</P>
      <Table rows={[
        ["PermanentDelegate", "SLAEnforcer PDA",    "Enables auto-transfer of penalties without worker signature"],
        ["TransferHook",      "FeeCollector PDA",   "0.1% hook on every transfer — funds the burn mechanism"],
        ["InterestBearing",   "8% APY rate config", "Staking rewards accrue on-chain without staking contract calls"],
      ]} />

      <H3>Deploying</H3>
      <Code language="bash">{`# Build all programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Create LOCK mint (after programs are deployed)
npx ts-node scripts/create-lock-mint.ts --cluster=devnet`}</Code>

      <H3>GovernanceProgram</H3>
      <P>The GovernanceProgram manages on-chain proposals. Votes are weighted by staked LOCK. Proposals that pass the 10M LOCK quorum and 60% approval threshold enter a 48-hour time-lock, then execute parameter changes via CPI to other programs.</P>
      <Code language="bash">{`# Create a governance proposal
anchor call governance create_proposal \\
  --args '{"title": "GIP-8: ...", "description": "...", "calls": [...]}'`}</Code>
    </div>
  ),
};

export default function DocsPage() {
  const [section, setSection] = useState<Section>("quickstart");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "start" }}>
        {/* Sidebar */}
        <div style={{ position: "sticky", top: 72 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>DOCUMENTATION</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                style={{
                  textAlign: "left", padding: "7px 12px", borderRadius: 5,
                  background: section === s.id ? "var(--orange-dim)" : "transparent",
                  border: section === s.id ? "1px solid var(--orange-border)" : "1px solid transparent",
                  color: section === s.id ? "var(--orange)" : "var(--text-muted)",
                  fontSize: 13, fontWeight: section === s.id ? 700 : 500,
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div style={{ marginTop: 28, padding: "14px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700, marginBottom: 6 }}>DEVNET</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Router: localhost:8080<br />
              RPC: Helius devnet<br />
              Status: <span style={{ color: "var(--green)" }}>Online</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="card" style={{ minHeight: 600 }}>
          {SECTIONS_CONTENT[section]}
        </div>
      </div>
    </motion.div>
  );
}
