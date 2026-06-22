# Gridlock

Decentralized AI inference marketplace on Solana with enforceable latency SLAs. Customers send OpenAI-compatible requests; GPU workers serve inference; if a worker misses the agreed latency target, penalties are settled automatically via on-chain LOCK token mechanics.

## Overview

Gridlock combines three layers:

1. **Router (TypeScript/Hono)** — Routes inference requests to workers, measures TTFT/TPOT, manages worker registry, caches KV prefixes in Redis, and coordinates on-chain settlement.
2. **Web app (Next.js)** — Dashboard for customers, workers, staking, governance, job explorer, and API documentation.
3. **On-chain programs (Anchor/Rust)** — Six Solana programs handle worker registration, job escrow, SLA receipts, penalty enforcement, fee distribution, and DAO governance.

The native token is **LOCK** (Token-2022), used for job fees, worker collateral, staking rewards, and automatic SLA penalties.

## Features

- **OpenAI-compatible API** — Drop-in `/v1/chat/completions` endpoint with a `gridlock` options object for SLA tier and privacy mode
- **Four SLA tiers** — Realtime, Standard, Batch, and Confidential (TEE-capable workers)
- **Automatic penalties** — SLA misses trigger on-chain settlement via Token-2022 PermanentDelegate
- **Disaggregated Prefill/Decode routing** — Separate worker roles for context processing, token generation, and KV-cache storage
- **KV-cache warm-path routing** — Prompt-prefix hashing with Redis-backed cache index
- **Worker registry** — Registration, heartbeats, AutoGating on timeout, and leaderboard rankings
- **Live job stream** — Server-Sent Events at `/v1/live`
- **Persistence** — Optional Supabase storage for jobs and workers
- **Autoscale signals** — Queue and TTFT pressure metrics for external orchestrators

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Solana Wallet Adapter, TanStack Query, Recharts |
| Backend | Node.js, Hono, TypeScript, redis, Supabase JS, @solana/web3.js |
| Blockchain | Solana, Anchor 1.0.2, Rust, Token-2022 |
| Infrastructure | Docker Compose, Redis 7 |

## Prerequisites

- **Node.js** 20+ and **npm** for the router API and web app
- **Rust** and **Anchor CLI** 1.0.2 for on-chain programs
- **Solana CLI** 3.1.10 (matching `Anchor.toml`)
- **Docker** and **Docker Compose** (optional, for full stack)
- **Redis** (optional — router falls back to in-memory cache)
- **Supabase** project (optional — router seeds mock data without it)
- **Inference backend** — vLLM server or Groq API (configured via `VLLM_ENDPOINT`)

## Installation

Clone the repository and enter the monorepo root:

```bash
cd gridlock
```

### Router service

```bash
cd gridlock-backend
cp .env.example .env
# Edit .env with your API keys and endpoints
npm install
npm run dev
```

The API runs at [http://localhost:8080](http://localhost:8080). Interactive docs are available when running (health at `/health`).

### Web app

```bash
cd gridlock-web
npm install
npm run dev
```

The web app runs at [http://localhost:3000](http://localhost:3000) and expects the router at `http://localhost:8080` (set via `NEXT_PUBLIC_API_URL`).

### Full stack with Docker Compose

From the monorepo root:

```bash
cp gridlock-backend/.env.example gridlock-backend/.env
# Edit gridlock-backend/.env before starting
docker compose up
```

This starts Redis (6379), the router (8080), and the web app (3000).

### On-chain programs

Requires Anchor and Solana toolchain:

```bash
anchor build
anchor deploy --provider.cluster localnet   # or devnet
```

Create the LOCK Token-2022 mint (devnet):

```bash
npx ts-node scripts/create-lock-mint.ts --cluster=devnet
```

## Usage

### Chat completions (OpenAI-compatible)

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello"}],
    "gridlock": {"sla": "standard", "privacy": false}
  }'
```

The response includes a `gridlock` object with latency metrics, SLA status, worker address, and fee/penalty details.

**SLA tiers and targets:**

| Tier | TTFT target | TPOT target | Penalty multiplier |
|------|-------------|-------------|-------------------|
| `realtime` | 300 ms | 60 ms | 2× fee |
| `standard` | 800 ms | 120 ms | 1× fee |
| `batch` | 5000 ms | — | 0.25× fee |
| `confidential` | 800 ms | 120 ms | 1× fee (+ TEE attestation) |

Enable streaming by setting `"stream": true` — the router returns Server-Sent Events in OpenAI chunk format.

### Register a worker

```bash
curl -X POST http://localhost:8080/v1/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "operator_pubkey": "YourSolanaWalletAddress...",
    "role": "Prefill",
    "hardware_tier": "RTX 4090",
    "tee_capable": false,
    "endpoint": "http://localhost:8000"
  }'
```

Send heartbeats every ~30 seconds to stay active:

```bash
curl -X POST http://localhost:8080/v1/workers/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"worker_address": "YourAddress...", "goodput_score": 847}'
```

Workers silent for more than 120 seconds are automatically set to `AutoGated` and stop receiving jobs until a heartbeat resumes.

### Other API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health, Solana slot, program IDs |
| `GET /v1/network/stats` | Network-wide SLA and worker statistics |
| `GET /v1/jobs` | Job history with filters |
| `GET /v1/workers` | Worker registry |
| `GET /v1/leaderboard` | Rankings by goodput, reliability, earnings |
| `GET /v1/live` | SSE stream of job settlement events |
| `GET /v1/models` | Available models and pricing |
| `GET /v1/stats/cache` | KV-cache hit/miss statistics |
| `GET /v1/stats/pd` | Prefill/Decode disaggregation stats |
| `GET /v1/autoscale/signal` | Scaling pressure recommendations |

Interactive API reference is in the web dashboard at `/docs`. Health check: [http://localhost:8080/health](http://localhost:8080/health).

## Configuration

Copy `gridlock-backend/.env.example` to `gridlock-backend/.env`:

```bash
# Inference backend
VLLM_ENDPOINT=https://api.groq.com/openai   # or http://localhost:8000 for self-hosted vLLM
VLLM_API_KEY=your-key

# Cache
REDIS_URL=redis://localhost:6379

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
ROUTER_KEYPAIR_PATH=~/.config/solana/id.json

# Database (optional)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_KEY=your-service-role-key

# Auth (comma-separated; leave empty for dev mode)
API_KEYS=sk-grid-changeme1,sk-grid-changeme2

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8080

# Misc
WATCHER_SAMPLE_RATE=0.05
```

When `API_KEYS` is empty, authentication is disabled (development mode). Open paths (`/health`, `/v1/live`) are always unauthenticated.

### Supabase setup

Run the SQL migration once in the Supabase SQL editor:

```bash
# Schema is in gridlock-backend/migrations/001_initial.sql
```

See also `preset/setup.md` for a quick-start preset with Groq, Supabase, and Helius devnet.

## Architecture

```
Customer / AI Agent
        │
        │ POST /v1/chat/completions
        ▼
┌───────────────────────────────┐
│      Gridlock Router          │
│  Hono (TypeScript) — port 8080│
│                               │
│  1. Auth (API key)            │
│  2. KV-cache prefix (Redis)   │
│  3. Pick Prefill/Decode worker│
│  4. Forward to vLLM/Groq      │
│  5. Measure TTFT / TPOT         │
│  6. Commit receipt on-chain   │
└───────────────────────────────┘
        │                │
   ┌────┴────┐     ┌─────┴──────────────────────────┐
   │ vLLM /  │     │ Solana Programs                │
   │ Groq    │     │  • ProviderRegistry            │
   │ Worker  │     │  • JobScheduler                │
   └─────────┘     │  • SLARegistry                 │
                   │  • SLAEnforcer                 │
                   │  • FeeCollector                │
                   │  • Governance                  │
                   └────────────────────────────────┘
```

**Worker roles:**

| Role | Purpose |
|------|---------|
| Prefill | Context processing → first token (compute-bound) |
| Decode | KV-cache continuation → token stream (memory-bound) |
| Cache | KV-prefix storage for warm-path routing |
| Router | Orchestration only (no inference) |

**On-chain settlement flow:**

1. Customer request → router measures latency
2. Router commits a `LatencyReceipt` to **SLARegistry**
3. Watcher nodes sample ~5% of jobs for independent verification
4. After challenge window, **SLAEnforcer** settles or penalizes via PermanentDelegate
5. **FeeCollector** splits revenue: 60% stakers / 20% worker / 10% burn / 10% treasury

## Project Structure

```
gridlock/
├── gridlock/                   # Anchor monorepo (on-chain programs)
│   ├── Anchor.toml
│   ├── Cargo.toml
│   ├── docker-compose.yml      # Redis + router + web
│   ├── programs/               # Anchor on-chain programs
│   ├── scripts/
│   └── preset/
├── gridlock-backend/           # TypeScript router API (Hono)
│   ├── src/
│   ├── migrations/             # Supabase schema
│   └── test/                   # API integration tests
├── gridlock-web/               # Next.js dashboard
└── gridlock-worker/            # Electron GPU worker desktop client
```

## Development

### Monorepo scripts

From `gridlock-backend/`:

```bash
npm run dev       # Start router API (watch mode)
npm run build     # Compile TypeScript
npm run start     # Run production build
npm run test:api  # API integration tests (server must be running)
```

### Web app

```bash
cd gridlock-web
npm run dev      # Development server
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint
```

### Router tests

With the router running on port 8080:

```bash
cd gridlock-backend
npm run test:api
npm run test:api -- --base http://localhost:8080 --key sk-grid-yourkey
```

### Anchor programs

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Program IDs for localnet and devnet are defined in `Anchor.toml`.

## Web Dashboard

The Next.js app provides these pages:

| Route | Purpose |
|-------|---------|
| `/` | Landing page with customer/worker views |
| `/console` | SLA inference console |
| `/worker` | Worker dashboard |
| `/explorer` | On-chain job explorer |
| `/stake` | LOCK staking |
| `/leaderboard` | Worker rankings |
| `/governance` | DAO proposals |
| `/docs` | API and architecture documentation |

Wallet connection uses Phantom and Solflare via `@solana/wallet-adapter-react`.

## License

Not specified in the repository.
