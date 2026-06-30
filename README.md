# Gridlock

Decentralized AI inference marketplace on Solana with enforceable latency SLAs. Customers send OpenAI-compatible requests; GPU and CPU workers run inference locally; the router measures TTFT/TPOT and coordinates optional on-chain LOCK settlement.

**Production API:** [https://api.grid-lock.tech](https://api.grid-lock.tech)

<p>
  <strong>Frontend &nbsp;</strong>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana_Wallet-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana Wallet Adapter" /></a>
  <a href="https://www.framer.com/motion"><img src="https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" /></a>
</p>

<p>
  <strong>Backend &nbsp;</strong>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" /></a>
  <a href="https://hono.dev"><img src="https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono" /></a>
  <a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/web3.js-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana web3.js" /></a>
  <img src="https://img.shields.io/badge/WebSocket-010101?style=for-the-badge" alt="WebSocket" />
</p>

<p>
  <strong>Workers &nbsp;</strong>
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" /></a>
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://ollama.com"><img src="https://img.shields.io/badge/Ollama-000?style=for-the-badge&logo=ollama&logoColor=white" alt="Ollama" /></a>
  <img src="https://img.shields.io/badge/vLLM-76B900?style=for-the-badge&logo=nvidia&logoColor=white" alt="vLLM" />
  <img src="https://img.shields.io/badge/WebGPU-0078D4?style=for-the-badge" alt="WebGPU" />
</p>

<p>
  <strong>Blockchain &nbsp;</strong>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.anchor-lang.com"><img src="https://img.shields.io/badge/Anchor-150?style=for-the-badge" alt="Anchor" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" /></a>
  <img src="https://img.shields.io/badge/Token--2022-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Token-2022" />
</p>

<p>
  <strong>Infra &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" /></a>
  <a href="https://www.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" /></a>
  <img src="https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
</p>

---
## Overview

Gridlock combines four layers:

1. **Router (`gridlock-backend`)** — Hono API: routes chat jobs, worker registry, WebSocket job dispatch, Redis KV-cache, Supabase persistence, optional Solana settlement.
2. **Web app (`gridlock-web`)** — Next.js dashboard: Console (playground, API keys, billing), worker operator UI, job explorer, staking, docs.
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
- **Wallet-owned API keys** — Create, list, revoke keys from the Console; hashed at rest in Supabase
- **Off-chain billing credits** — Per-wallet $LOCK balance, usage metering, monthly invoices, on-chain treasury deposits
- **Wallet console sessions** — One signature → 24h session token for Billing / API Keys reads (no re-sign on every tab visit)
- **Passive $LOCK staking** — Deposit to a per-wallet on-chain vault, earn from the staker pool; unstake with a configurable cooldown

## Tech Stack

The badges above summarize the main tools per layer. Additional details:

| Layer | Also includes |
|-------|----------------|
| Frontend | Radix UI, TanStack Query, Recharts, Zustand, `@solana/spl-token` |
| Backend | `@hono/node-server`, `@supabase/supabase-js`, SSE (`/v1/live`) |
| Desktop worker | `nvidia-smi` / ROCm / WMI hardware detection |
| Native worker | Headless Node.js CLI (`gridlock-native-worker`) |
| Blockchain | Six Anchor programs (fee collector, job scheduler, SLA, governance, …) |
| Infrastructure | Groq / self-hosted vLLM as router inference fallback |

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

When deployed (e.g. grid-lock.tech), the web app defaults to `https://api.grid-lock.tech` if `NEXT_PUBLIC_API_URL` is unset and the host is not localhost.

App runs at [http://localhost:3000](http://localhost:3000).

### Desktop worker (Electron)

**Windows installer:** download-and-go — bundled Python, in-app Ollama setup, one-click model download. See [`gridlock-worker/RELEASE.md`](gridlock-worker/RELEASE.md).

```bash
cd gridlock-worker
pip install -r python/requirements.txt   # dev only — not needed for packaged .exe
npm install
npm run dev
```

1. Enter your **Solana public address** (no private key).
2. In **Settings**, choose compute device: **Auto**, **CPU**, or **GPU**.
3. Complete **Setup** (Ollama + model) — packaged app guides you; dev mode needs local Ollama.
4. Click **Start Worker**.

Production API: **`https://api.grid-lock.tech`** (override with `GRIDLOCK_BACKEND_URL` for local dev).

Package: `npm run package` on Windows → `release/Gridlock-Worker-Setup-0.1.0.exe` (version from `package.json`)

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

See `gridlock/cloudflare/cloudflare.env.example` and `gridlock/cloudflare/setup-tunnel.sh` to expose the router at a public hostname (e.g. `api.grid-lock.tech`).

## Wallet model

| Surface | Wallet | Purpose |
|---------|--------|---------|
| **Electron worker** | Public address only (typed in Settings) | Identity, registration, job routing, earnings attribution |
| **Web `/worker`** | Phantom / Solflare connect | Operator dashboard, pause/resume, confidential mode, worker collateral |
| **Web `/console`** | Phantom connect + message sign | API key management, billing, playground chat |
| **Web `/stake`** | Phantom connect (reads unsigned) | View pool/position; sign only for stake/unstake actions |
| **Backend** | Router keypair (`.env`) | Optional on-chain job settlement |

The desktop app **does not** use Phantom and **must not** ask for private keys. Use the same public address on desktop and web so the worker dashboard shows one unified operator.

### Console auth model

Two layers keep signatures minimal:

1. **Wallet session** — `POST /v1/auth/session` with a one-time `"session"` message signature returns a 24h HMAC token. Billing and API Keys **reads** use `Authorization: Bearer <session>` instead of signing again.
2. **Action signatures** — Mutations (`create key`, `deposit`, `stake`, etc.) still require a fresh `gridlock:keys:{action}:{wallet}:{timestamp}` signature (cached ~4 minutes per action in the browser).

**Public reads (no signature):** stake position via `GET /v1/stake/position?wallet=…`, stake deposit info via `GET /v1/stake/deposit/info?wallet=…`, model pricing via `GET /v1/models`, job explorer data, worker list.

## Usage

### Chat completions (Console / API)

```bash
curl https://api.grid-lock.tech/v1/chat/completions \
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
curl -X POST https://api.grid-lock.tech/v1/workers/register \
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
curl -X POST https://api.grid-lock.tech/v1/workers/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"worker_address": "YourAddress", "goodput_score": 847}'
```

Workers connect via **WebSocket** at `/v1/ws` with `worker:register` (`worker_type`: `desktop` | `native` | `browser`).

Check operator status (includes live connection info):

```bash
curl https://api.grid-lock.tech/v1/workers/YOUR_WALLET_ADDRESS
```

Response includes `ws_online`, `ws_worker_type`, `ws_busy`, and recent jobs.

Workers silent for more than 120 seconds are set to `AutoGated` until the next heartbeat.

### Console — API keys and billing

Connect a wallet at `/console`. Key management and billing use wallet message signatures; **reads** can use a 24h session token from `POST /v1/auth/session` so you are not prompted on every tab load.

**API keys**

- Create keys tied to your wallet (hashed in Supabase via migration `002_api_keys.sql`).
- Use `Authorization: Bearer gk_…` in the playground or external clients.
- Chat requires a valid key once any keys exist in the database (or when `API_KEYS` is set in the backend env).

**Billing**

- Inference deducts off-chain $LOCK credits when `GRIDLOCK_BILLING_ENABLED=true`.
- Deposit on-chain $LOCK to the treasury ATA; `POST /v1/billing/deposit/confirm` verifies the transaction and credits your balance.
- Monthly invoices are generated automatically; see `/console` → Billing.
- Dev test credits: `POST /v1/billing/topup` when `GRIDLOCK_BILLING_DEV_TOPUP=true`.

Requires Supabase migrations `003`–`006` (see [Supabase migrations](#supabase-migrations)).

### Staking

Passive staking at `/stake` is separate from worker collateral (operator stake on `/worker`).

1. **Deposit** — Transfer $LOCK from your wallet to your staker vault (PDA `["staker_vault", wallet]` under the FeeCollector program). Balances are read from devnet RPC; optional `POST /v1/stake/deposit/confirm` records the deposit in Supabase.
2. **Unstake** — `POST /v1/stake/unstake/request` starts a cooldown (default 7 days, overridable via `GRIDLOCK_STAKE_COOLDOWN_SEC`).
3. **Claim** — After cooldown, claim returns $LOCK to your wallet via the FeeCollector `claim_unstake` instruction. Enable with `GRIDLOCK_STAKING_CLAIM_ENABLED=true` after redeploying the updated FeeCollector program.

Pool stats (`GET /v1/stake/info`) and your position (`GET /v1/stake/position?wallet=…`) are public reads and do not require a wallet signature.

Requires migration `007_stake.sql`.

**On-chain components**

| Component | Notes |
|-----------|--------|
| `distribute_fees` → staker pool | Deployed; 60% of job fees |
| `distribute_epoch_rewards` | In program; backend cron not wired |
| Passive deposit (SPL → vault ATA) | Live |
| Unstake cooldown | Tracked in Supabase |
| Unstake claim (PDA-signed withdraw) | Requires FeeCollector redeploy |

### Web dashboard routes

| Route | Purpose |
|-------|---------|
| `/` | Landing |
| `/console` | Playground, **API Keys**, **Billing** (live wallet data) |
| `/worker` | Operator dashboard, browser worker, native worker docs |
| `/explorer` | Job history (live API) |
| `/leaderboard` | Worker rankings |
| `/stake` | Passive $LOCK staking — pool TVL, position, deposit / unstake |
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

# Database (optional — run migrations in order; see Supabase section)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_KEY=your-service-role-key

# Auth — comma-separated bootstrap keys; empty = dev mode for chat when no DB keys exist
API_KEYS=
# Dev only: trust X-Gridlock-Wallet header without signature on /v1/keys and billing
GRIDLOCK_INSECURE_KEY_MANAGEMENT=false
# HMAC secret for 24h console session tokens (defaults to SUPABASE_KEY in dev)
# GRIDLOCK_WALLET_SESSION_SECRET=

# Billing — off-chain $LOCK credits (set false to disable balance checks on chat)
GRIDLOCK_BILLING_ENABLED=true
GRIDLOCK_STARTING_CREDIT_LOCK=10
GRIDLOCK_MIN_DEPOSIT_LOCK=1
# Dev: POST /v1/billing/topup adds test credits (wallet-signed)
GRIDLOCK_BILLING_DEV_TOPUP=false
# Optional treasury LOCK ATA override (defaults to ATA of TREASURY + LOCK_MINT)
# BILLING_DEPOSIT_VAULT=
SOLANA_CLUSTER=devnet
# GRIDLOCK_INVOICE_CRON_SECRET=   # protect POST /v1/billing/invoices/close-all

# Staking
GRIDLOCK_STAKING_ENABLED=true
GRIDLOCK_MIN_STAKE_LOCK=1
# GRIDLOCK_STAKE_COOLDOWN_SEC=604800   # 7 days; use 60 for dev
# GRIDLOCK_STAKING_CLAIM_ENABLED=true  # after FeeCollector redeploy with claim_unstake

# Solana devnet vaults (when SOLANA_SETTLEMENT_ENABLED=true)
# LOCK_MINT=...
# FEE_VAULT=...
# STAKER_POOL=...
# TREASURY=...
# CUSTOMER_WALLET=...

# Misc
WATCHER_SAMPLE_RATE=0.05
```

**Public without API key:** `/health`, `/v1/live`, `/v1/ws`, `/v1/network/stats`, `/v1/capacity/tee`, `/v1/models`, `/v1/stake/info`, `/v1/stake/position`, `/v1/stake/deposit/info`, worker register/heartbeat/list, and job reads used by the explorer.

Chat requires an API key when keys exist in Supabase or `API_KEYS`. Billing and key-management routes require a wallet signature or session token (unless insecure dev mode).

### Web (`gridlock-web/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8081
NEXT_PUBLIC_LOCK_MINT=your-devnet-lock-mint
# Dev only — skip wallet signatures in Console
# NEXT_PUBLIC_INSECURE_KEY_MANAGEMENT=true
# NEXT_PUBLIC_GRIDLOCK_BILLING_DEV_TOPUP=true
```

### Desktop worker

| Variable | Default | Description |
|----------|---------|-------------|
| `GRIDLOCK_BACKEND_URL` | `https://api.grid-lock.tech` | Router URL |
| `GRIDLOCK_WALLET` | — | Solana public address |
| `GRIDLOCK_COMPUTE_DEVICE` | `auto` | `auto`, `cpu`, or `gpu` |
| `GRIDLOCK_OLLAMA_MODEL` | `llama3.1:8b` | Ollama model |
| `GRIDLOCK_TEE` | `false` | Register as TEE-capable |

Router URL is hardcoded in the Electron app for production; use `GRIDLOCK_BACKEND_URL` for local backend testing.

### Supabase migrations

Run these **in order** in the Supabase SQL editor (or via `psql -f …`):

| File | Purpose |
|------|---------|
| `001_initial.sql` | Jobs, workers baseline |
| `002_jobs_extras.sql` | Job metadata extras |
| `002_api_keys.sql` | Wallet-owned API keys (hashed) |
| `003_billing.sql` | Customer balances, usage events |
| `004_customer_balances.sql` | Balance column refinements |
| `005_billing_invoices.sql` | Monthly invoices |
| `006_billing_deposits.sql` | On-chain deposit audit trail |
| `007_stake.sql` | Stake deposits + unstake cooldown requests |

Path: `gridlock-backend/migrations/`. See `gridlock/preset/setup.md` for a Groq + Supabase + Helius preset.

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
| `POST /v1/chat/completions` | OpenAI-compatible chat (API key when keys configured) |
| `POST /v1/auth/session` | Wallet-signed → 24h console session token |
| `GET/POST/PATCH/DELETE /v1/keys` | API key CRUD (wallet-signed) |
| `GET /v1/billing/summary` | Credits, usage, balance (session or signature) |
| `GET /v1/billing/invoices` | Monthly invoices |
| `GET /v1/billing/deposit/info` | Treasury deposit addresses |
| `POST /v1/billing/deposit/confirm` | Verify on-chain $LOCK deposit → credit balance |
| `POST /v1/billing/topup` | Dev-only test credits |
| `GET /v1/stake/info` | Staker pool TVL, revenue split, APY constants |
| `GET /v1/stake/position?wallet=` | On-chain staked balance + tier (public) |
| `GET /v1/stake/deposit/info?wallet=` | Staker vault addresses for deposit tx |
| `POST /v1/stake/deposit/confirm` | Verify stake deposit tx |
| `POST /v1/stake/unstake/request` | Start unstake cooldown |
| `POST /v1/stake/unstake/claim-tx` | Unsigned claim tx (after program redeploy) |
| `GET /v1/workers` | Worker list (public — explorer) |
| `GET /v1/workers/:address` | Worker profile + `ws_online` + recent jobs |
| `POST /v1/workers/register` | Register worker (public) |
| `POST /v1/workers/heartbeat` | Heartbeat (public) |
| `GET /v1/jobs` | Job history |
| `GET /v1/models` | Model pricing (public — billing UI) |
| `GET /v1/network/stats` | Network statistics |
| `GET /v1/capacity/tee` | TEE worker capacity |
| `GET /v1/live` | SSE job events |
| `WS /v1/ws` | Worker registration and job push |

Full docs in the web app at `/docs`.

## License

Not specified in the repository.
