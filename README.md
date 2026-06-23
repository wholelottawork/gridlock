# Gridlock

Decentralized AI inference marketplace on Solana with enforceable latency SLAs. Customers send OpenAI-compatible requests; GPU and CPU workers run inference locally; the router measures TTFT/TPOT and coordinates optional on-chain LOCK settlement.

**Production API:** [https://api.reacton.dev](https://api.reacton.dev)

## Overview

Gridlock combines four layers:

1. **Router (`gridlock-backend`)** — Hono API: routes chat jobs, worker registry, WebSocket job dispatch, Redis KV-cache, Supabase persistence, optional Solana settlement.
2. **Web app (`gridlock-web`)** — Next.js dashboard: Console playground, worker operator UI (Phantom wallet), job explorer, docs.
3. **Worker clients** — Desktop (Electron), headless native CLI, or in-browser WebGPU worker. All connect to the router; inference runs locally via **Ollama** or **vLLM**.
4. **On-chain programs (Anchor/Rust)** — Worker registration, job escrow, SLA receipts, penalties, fee distribution, governance (optional; backend can settle locally when chain is disabled).

The native token is **LOCK** (Token-2022), used for job fees, worker collateral, staking, and SLA penalties when on-chain settlement is enabled.

## Features

- **OpenAI-compatible API** — `/v1/chat/completions` with a `gridlock` object for SLA tier and confidential mode
- **Four SLA tiers** — Realtime, Standard, Batch, Confidential (TEE-capable workers)
- **Multiple worker runtimes** — Desktop app, native CLI, browser WebGPU; unified registry and WebSocket hub
- **Live worker status** — Web dashboard shows desktop/browser/native connection state per wallet
- **Hardware flexibility** — Desktop worker auto-detects CPU, NVIDIA, and AMD; optional CPU-only or GPU inference via Ollama
- **Automatic penalties** — SLA misses trigger settlement (on-chain when configured)
- **Prefill/Decode routing** — Disaggregated worker roles and KV warm-path via Redis
- **TEE / confidential jobs** — Dev attestation today; production path for TEE-capable workers
- **Persistence** — Supabase for jobs and workers; Redis for cache (in-memory fallback)
- **Live stream** — SSE at `/v1/live`

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js, React, Solana Wallet Adapter, Recharts |
| Backend | Node.js, Hono, TypeScript, Redis, Supabase, `@solana/web3.js`, WebSocket (`ws`) |
| Desktop worker | Electron, Python daemon, Ollama/vLLM, `nvidia-smi` / ROCm / WMI detection |
| Native worker | Node.js CLI, Ollama/vLLM |
| Blockchain | Solana, Anchor, Rust, Token-2022 |
| Infrastructure | Docker Compose, Redis, Cloudflare Tunnel |

## Prerequisites

- **Node.js** 20+ and **npm**
- **Python** 3.10+ (desktop worker daemon)
- **Ollama** ([download](https://ollama.com/download)) — recommended for Windows/macOS workers
- **Redis** (optional — in-memory cache fallback)
- **Supabase** (optional — local seed data when unset)
- **Rust / Anchor / Solana CLI** — only for on-chain program development
- **Inference fallback** — Groq or self-hosted vLLM on the router (`VLLM_ENDPOINT`) when no live worker is connected

## Project Structure

```
gridlock/
├── gridlock-backend/       # Router API (Hono)
├── gridlock-web/           # Next.js dashboard
├── gridlock-worker/        # Electron desktop worker
├── gridlock-native-worker/ # Headless CLI worker (npm package)
├── gridlock/               # Anchor programs, docker-compose, cloudflare tunnel
│   ├── programs/
│   ├── docker-compose.yml
│   └── cloudflare/
└── README.md
```

## Installation

### Router (backend)

```bash
cd gridlock-backend
cp .env.example .env
# Edit .env — see Configuration below
npm install
npm run dev
```

Default port is **8080**. If that port is in use:

```bash
PORT=8081 npm run dev
```

Health check: `GET /health`

### Web app

```bash
cd gridlock-web
cp .env.local.example .env.local   # if present, or create .env.local
npm install
npm run dev
```

Set the router URL:

```bash
# .env.local — local dev
NEXT_PUBLIC_API_URL=http://localhost:8081
```

When deployed (e.g. reacton.dev), the web app defaults to `https://api.reacton.dev` if `NEXT_PUBLIC_API_URL` is unset and the host is not localhost.

App runs at [http://localhost:3000](http://localhost:3000).

### Desktop worker (Electron)

```bash
cd gridlock-worker
pip install -r python/requirements.txt
npm install
npm run dev
```

1. Enter your **Solana public address** (no private key — see Wallet model below).
2. In **Settings**, choose compute device: **Auto**, **CPU**, or **GPU**.
3. Install **Ollama** and pull a model: `ollama pull llama3.1:8b`
4. Click **Start Worker**.

The app connects to **`https://api.reacton.dev`** by default (override with `GRIDLOCK_BACKEND_URL` for local dev).

Package installers: `npm run package`

### Native worker (CLI)

See [`gridlock-native-worker/README.md`](gridlock-native-worker/README.md).

```bash
cd gridlock-native-worker
npm install && npm run build
node dist/index.js --wallet YOUR_SOLANA_PUBKEY
```

### Docker Compose (Redis + router + web)

```bash
cp gridlock-backend/.env.example gridlock-backend/.env
docker compose -f gridlock/docker-compose.yml up
```

Starts Redis (6379), router (8080), web (3000).

### Production tunnel (Cloudflare)

See `gridlock/cloudflare/cloudflare.env.example` and `gridlock/cloudflare/setup-tunnel.sh` to expose the router at a public hostname (e.g. `api.reacton.dev`).

## Wallet model

| Surface | Wallet | Purpose |
|---------|--------|---------|
| **Electron worker** | Public address only (typed in Settings) | Identity, registration, job routing, earnings attribution |
| **Web `/worker`** | Phantom / Solflare connect | Operator dashboard, pause/resume, confidential mode, future claim/stake |
| **Backend** | Router keypair (`.env`) | Optional on-chain job settlement |

The desktop app **does not** use Phantom and **must not** ask for private keys. Use the same public address on desktop and web so the worker dashboard shows one unified operator.

## Usage

### Chat completions (Console / API)

```bash
curl https://api.reacton.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "llama3.1:8b",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false,
    "gridlock": {"sla": "standard", "privacy": false}
  }'
```

When a worker is **Active** and connected over WebSocket, the router dispatches the job to that worker’s local Ollama/vLLM. Otherwise it may fall back to the router’s configured `VLLM_ENDPOINT` (e.g. Groq).

**SLA tiers:**

| Tier | TTFT target | TPOT target | Penalty multiplier |
|------|-------------|-------------|-------------------|
| `realtime` | 300 ms | 60 ms | 2× fee |
| `standard` | 800 ms | 120 ms | 1× fee |
| `batch` | 5000 ms | — | 0.25× fee |
| `confidential` | 800 ms | 120 ms | 1× fee (+ TEE attestation) |

Set `"stream": true` for SSE streaming in OpenAI chunk format.

### Register and run a worker

Workers register with the router (no API key required for worker routes):

```bash
curl -X POST https://api.reacton.dev/v1/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "operator_pubkey": "YourSolanaWalletAddress",
    "role": "Prefill",
    "hardware_tier": "RTX 4090",
    "tee_capable": false,
    "endpoint": "desktop://rtx-4090"
  }'
```

Heartbeats while running:

```bash
curl -X POST https://api.reacton.dev/v1/workers/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"worker_address": "YourAddress", "goodput_score": 847}'
```

Workers connect via **WebSocket** at `/v1/ws` with `worker:register` (`worker_type`: `desktop` | `native` | `browser`).

Check operator status (includes live connection info):

```bash
curl https://api.reacton.dev/v1/workers/YOUR_WALLET_ADDRESS
```

Response includes `ws_online`, `ws_worker_type`, `ws_busy`, and recent jobs.

Workers silent for more than 120 seconds are set to `AutoGated` until the next heartbeat.

### Web dashboard routes

| Route | Purpose |
|-------|---------|
| `/` | Landing |
| `/console` | Playground — chat with SLA / confidential toggles |
| `/worker` | Operator dashboard, browser worker, native worker docs |
| `/explorer` | Job history (live API) |
| `/leaderboard` | Worker rankings |
| `/stake` | LOCK staking |
| `/governance` | DAO proposals |
| `/docs` | API reference |

## Configuration

### Backend (`gridlock-backend/.env`)

```bash
# Server
PORT=8080

# Inference fallback (when no WS worker handles the job)
VLLM_ENDPOINT=https://api.groq.com/openai
VLLM_API_KEY=your-key

# Cache
REDIS_URL=redis://localhost:6379

# Solana (optional)
SOLANA_RPC_URL=https://api.devnet.solana.com
ROUTER_KEYPAIR_PATH=~/.config/solana/id.json
SOLANA_SETTLEMENT_ENABLED=false   # set true when vaults/mints are ready

# Database (optional)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_KEY=your-service-role-key

# Auth — comma-separated; empty = dev mode (worker routes always public)
API_KEYS=

# Misc
WATCHER_SAMPLE_RATE=0.05
```

**Public without API key:** `/health`, `/v1/live`, `/v1/ws`, `/v1/network/stats`, `/v1/capacity/tee`, all `/v1/workers/*`, and `/v1/jobs/*`.

Chat and customer endpoints require an API key when `API_KEYS` is set.

### Desktop worker

| Variable | Default | Description |
|----------|---------|-------------|
| `GRIDLOCK_BACKEND_URL` | `https://api.reacton.dev` | Router URL |
| `GRIDLOCK_WALLET` | — | Solana public address |
| `GRIDLOCK_COMPUTE_DEVICE` | `auto` | `auto`, `cpu`, or `gpu` |
| `GRIDLOCK_OLLAMA_MODEL` | `llama3.1:8b` | Ollama model |
| `GRIDLOCK_TEE` | `false` | Register as TEE-capable |

Router URL is hardcoded in the Electron app for production; use `GRIDLOCK_BACKEND_URL` for local backend testing.

### Supabase

Run `gridlock-backend/migrations/001_initial.sql` in the Supabase SQL editor. See `gridlock/preset/setup.md` for a Groq + Supabase + Helius preset.

## Architecture

```
Customer / Console
        │
        │ POST /v1/chat/completions
        ▼
┌───────────────────────────────┐
│      Gridlock Router          │
│  Hono + WebSocket hub         │
│                               │
│  1. Auth (API key, customers) │
│  2. KV-cache prefix (Redis)   │
│  3. Pick worker (Prefill/…)   │
│  4. WS dispatch → worker      │
│     or vLLM/Groq fallback     │
│  5. Measure TTFT / TPOT       │
│  6. Optional on-chain settle  │
└───────────────────────────────┘
        │
   ┌────┴────────────────────────────┐
   │ Worker clients (same wallet)    │
   │  • Electron + Python daemon     │
   │  • gridlock-native-worker CLI   │
   │  • Browser WebGPU worker        │
   │                                 │
   │  Local inference: Ollama / vLLM │
   └─────────────────────────────────┘
```

**Worker roles:** Prefill, Decode, Cache, Router (orchestration only).

**Operator flow:** Register wallet → start desktop or browser worker → monitor on web `/worker` → send jobs from `/console`.

## Development

### Backend

```bash
cd gridlock-backend
npm run dev          # watch mode
npm run build
npm run test:api     # server must be running
```

### Web

```bash
cd gridlock-web
npm run dev
npm run build
npm run lint
```

### Desktop worker

```bash
cd gridlock-worker
npm run dev          # Electron + Python daemon on :7420
npm run package      # Windows/macOS/Linux installers
```

### Anchor programs

```bash
cd gridlock
anchor build
anchor deploy --provider.cluster devnet
```

Program IDs are in `gridlock/Anchor.toml`.

## API reference (selected)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health, worker counts, Solana slot |
| `POST /v1/chat/completions` | OpenAI-compatible chat (customer API key) |
| `GET /v1/workers/:address` | Worker profile + `ws_online` + recent jobs |
| `POST /v1/workers/register` | Register worker (public) |
| `POST /v1/workers/heartbeat` | Heartbeat (public) |
| `GET /v1/jobs` | Job history |
| `GET /v1/network/stats` | Network statistics |
| `GET /v1/capacity/tee` | TEE worker capacity |
| `GET /v1/live` | SSE job events |
| `WS /v1/ws` | Worker registration and job push |

Full docs in the web app at `/docs`.

## License

Not specified in the repository.
