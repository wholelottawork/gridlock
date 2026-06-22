# Gridlock — Product & Implementation Plan

This document is the source of truth for turning Gridlock from a **marketplace-shaped prototype** into a **user-friendly decentralized GPU inference network**. Follow phases in order; each phase has clear exit criteria before moving on.

---

## Vision

**Customers** send OpenAI-compatible chat requests with an SLA tier. **GPU owners** run installable worker software that serves models locally. The **router** picks workers, measures latency (TTFT / TPOT), and **Solana programs** handle fees, stakes, and automatic SLA penalties in LOCK.

**User-friendly means:** GPU sellers never run `pip install vllm` or manual `curl` commands. They download an app, connect a wallet, pick a model, and click **Start earning**.

---

## Current State vs Target

| Area | Today | Target |
|------|-------|--------|
| Worker onboarding | Manual vLLM + REST `curl` register/heartbeat | Desktop app with GUI |
| Inference backend | Shared `VLLM_ENDPOINT` (often Groq) for all workers | Each worker serves from their own local endpoint |
| Worker software | None in repo | Electron (or Tauri) app + inference sidecar |
| Job payment | Fee computed off-chain; no escrow per job | Customer pays LOCK into escrow before inference |
| On-chain settlement | Partial (`commit_receipt` → settle); skipped on localhost | Full lifecycle on devnet/mainnet |
| Watcher verification | Random log in router | Independent watcher service |
| Prefill / Decode split | Decode worker picked but never called | Implement or remove from marketing |
| Web dashboard | Mix of real API + heavy mock data | Real data only (or explicit demo mode) |
| Landing / docs | Claims features not fully wired | Honest “shipped vs planned” labels |

---

## Architecture (Target)

```
┌─────────────────────────────────────────────────────────────┐
│  Customer (app, agent, script)                              │
│  POST /v1/chat/completions + gridlock.sla                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Gridlock Router (Hono/TypeScript) — gridlock-backend       │
│  auth · worker pick · latency measure · on-chain settlement  │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTP to worker.endpoint
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Gridlock Worker Desktop (NEW — apps/worker-desktop)        │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │ Electron UI         │    │ Inference sidecar           │ │
│  │ wallet · earnings   │───▶│ Ollama or vLLM              │ │
│  │ model picker        │    │ localhost OpenAI API        │ │
│  │ start / stop        │    │ optional tunnel (CF/ngrok)  │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│  registers + heartbeats → router                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Solana (Anchor programs — existing programs/)              │
│  ProviderRegistry · JobScheduler · SLARegistry ·            │
│  SLAEnforcer · FeeCollector · Governance                      │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Electron is the **UI shell**. Inference runs in a **separate sidecar process** (Ollama or bundled vLLM), not inside the renderer.

---

## Monorepo Layout (After Plan)

```
gridlock/
├── gridlock-backend/        # TypeScript router API (Hono)
├── gridlock-web/            # Customer dashboard
├── gridlock-worker/         # Electron worker app
├── programs/                # Anchor on-chain (existing)
├── scripts/
└── docs/
    └── PLAN.md              # symlink or copy — this file lives at repo root
```

---

## Phase 0 — Honesty & Demo Mode

**Goal:** Stop misleading users and developers. Separate demo from production behavior.

### Tasks

- [ ] Add `DEMO_MODE=true` env flag to router and web app
- [ ] When `DEMO_MODE`: allow Groq shared endpoint, seed fake workers/jobs
- [ ] When `DEMO_MODE=false`: require real worker endpoints; no seed data
- [ ] Update `README.md` with **Shipped / Partial / Planned** feature table
- [ ] Update `gridlock-web` docs to label Groq as **demo-only**, vLLM/local as **production worker path**
- [ ] Rename or comment router `_watcher_sample` → `_watcher_simulation` to avoid confusion with on-chain watchers

### Exit criteria

- New developer can tell in 5 minutes what is real vs simulated
- Production config never defaults all workers to one Groq URL

---

## Phase 1 — Gridlock Worker Desktop (MVP)

**Goal:** GPU owner can install one app and participate without touching the terminal.

### Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| UI shell | **Electron + React** (or Tauri v2 if bundle size matters) | Match web app stack (React, Tailwind) |
| Inference sidecar | **Ollama first** (v1), vLLM optional (v2) | Ollama easier to bundle; OpenAI-compatible API |
| Wallet | `@solana/wallet-adapter` or embedded keypair (user choice) | Same as web |
| Packaging | `electron-builder` | Windows + NVIDIA first |

### App screens (v1)

1. **Welcome** — what Gridlock is, system requirements (NVIDIA GPU, 16GB+ VRAM for 8B)
2. **GPU detect** — show GPU name, VRAM, driver status; block if unsupported
3. **Model setup** — download recommended model (e.g. Llama 3.1 8B); progress bar
4. **Wallet** — connect Phantom / import key; show address
5. **Network** — router URL (default prod/dev); optional tunnel toggle for home users
6. **Stake** (stub OK in v1) — link to web stake page or in-app later
7. **Dashboard** — Online / Offline toggle, jobs today, TTFT chart, earnings, SLA pass rate
8. **Settings** — role (Prefill), hardware tier auto-detected, logs

### Worker agent responsibilities (main process)

- [ ] Spawn / stop Ollama (or sidecar) subprocess
- [ ] Health-check `http://127.0.0.1:11434` (Ollama) or `:8000` (vLLM)
- [ ] Resolve public URL:
  - LAN: user enters port-forward / public IP, or
  - Tunnel: integrate Cloudflare Tunnel or ngrok SDK (Phase 1b)
- [ ] `POST /v1/workers/register` with operator pubkey + **unique** endpoint
- [ ] Heartbeat every 30s with `goodput_score`, `p99_ttft_ms`
- [ ] On quit: send pause / stop heartbeats; graceful drain option
- [ ] Auto-reconnect if router unreachable

### New package

```
apps/worker-desktop/
├── package.json
├── electron/
│   ├── main.ts          # process manager, gridlock client
│   └── preload.ts
├── src/                 # React UI
├── sidecar/             # scripts to install/start Ollama per OS
└── electron-builder.yml
```

### Exit criteria

- Windows user installs `.exe`, connects wallet, downloads model, clicks **Start**
- Router shows worker as **Active** with a **distinct** endpoint (not shared Groq)
- Router can route a test job to that worker’s local inference server
- Heartbeats keep worker from being AutoGated

---

## Phase 2 — Router Hardening for Real Workers

**Goal:** Router behaves like a marketplace, not a Groq proxy.

### Tasks

- [ ] **Require `endpoint`** on worker register when `DEMO_MODE=false`
- [ ] **Reject** registration if endpoint equals router’s `VLLM_ENDPOINT` or known shared APIs (Groq, OpenAI)
- [ ] **Reachability probe** on register: router HEAD/GET health to worker endpoint (with timeout)
- [ ] **Endpoint ownership challenge** (signed message from operator wallet) before accepting register
- [ ] Remove or gate `_seed_workers()` / `_seed_jobs()` behind `DEMO_MODE`
- [ ] Validate worker has minimum `staked_lock` for requested SLA tiers (read from chain or registry)
- [ ] Store `models` supported per worker; route only if customer model matches
- [ ] Improve error messages when no eligible worker (tier, TEE, model, offline)

### Optional (Phase 2b)

- [ ] Implement Prefill → Decode handoff, **or** remove Decode from worker roles until built
- [ ] Wire Cache-role workers to Redis warm-path routing

### Exit criteria

- Two workers on two machines get different jobs based on goodput / availability
- Fake “worker pointing at Groq” is rejected in production mode

---

## Phase 3 — Payments & On-Chain Job Lifecycle

**Goal:** Money flow matches docs: escrow → inference → receipt → settle.

### Intended flow

```
Customer pays LOCK (open_job escrow)
        ↓
Router assigns worker → inference
        ↓
Router commits LatencyReceipt (SLARegistry)
        ↓
Challenge window / watcher sample (Phase 4)
        ↓
SLAEnforcer.settle_or_penalize
        ↓
FeeCollector.distribute_fees (60/20/10/10)
```

### Router tasks

- [ ] Call `JobScheduler.open_job` before forwarding inference (customer signs or delegated payer)
- [ ] Assign worker on-chain when worker picked
- [ ] `anchor_commit_receipt` after latency measured (exists — wire fully)
- [ ] Respect challenge window before `settle_or_penalize` (or `finalize_unchallenged`)
- [ ] Remove localhost skip for devnet testing; use env `SOLANA_CLUSTER=devnet`
- [ ] Worker registration: call `ProviderRegistry.register_worker` + stake instructions

### Web / API tasks

- [ ] Customer console: fund jobs with LOCK (wallet tx before API key use)
- [ ] Show escrow / settlement status per job in explorer

### Exit criteria

- End-to-end devnet demo: customer pays → worker serves → SLA miss triggers penalty tx
- Job record shows on-chain tx signatures

---

## Phase 4 — Watcher Network

**Goal:** Replace simulated watcher with real independent verification.

### Tasks

- [ ] New `services/watcher/` — samples ~5% of jobs, measures TTFT independently
- [ ] Call `SLARegistry.sample_verify` on-chain when delta > 50ms
- [ ] Watcher stakes LOCK; slashed if dishonest
- [ ] Router `_watcher_sample` removed or demo-only

### Exit criteria

- Dispute path tested on devnet with intentional TTFT mismatch

---

## Phase 5 — Web App Cleanup

**Goal:** Customer-facing UI reflects live network; worker onboarding points to desktop app.

### Tasks

- [ ] Replace `mock-data.ts` usage with API-only + empty states
- [ ] Gate all mocks behind `NEXT_PUBLIC_DEMO_MODE`
- [ ] Landing page: **Download Worker** CTA → links to desktop releases
- [ ] Worker web page (`/worker`): redirect or embed “use desktop app” for providers
- [ ] Stake page: wire real LOCK mint + stake instructions (`create-lock-mint.ts`, `NEXT_PUBLIC_LOCK_MINT`)
- [ ] Governance page: read real proposals or hide until on-chain DAO live
- [ ] Console / explorer / leaderboard: consume router + Supabase only

### Exit criteria

- With router running and no demo flag, UI shows only real workers and jobs

---

## Phase 6 — Distribution & Polish

**Goal:** Ship installable worker app to real users.

### Tasks

- [ ] Code signing (Windows/macOS)
- [ ] Auto-update channel (electron-updater)
- [ ] macOS Apple Silicon support
- [ ] Linux AppImage (optional)
- [ ] AMD ROCm path (later)
- [ ] Confidential / TEE tier (much later — needs attestation infra)
- [ ] In-app support links, crash reporting

### Exit criteria

- Signed installer published in GitHub Releases
- One-page “Getting started as a worker” docs

---

## Configuration Reference

### Router (`gridlock-backend/.env`)

| Variable | Demo | Production |
|----------|------|------------|
| `DEMO_MODE` | `true` | `false` |
| `VLLM_ENDPOINT` | Groq URL OK | Router fallback only; not used as worker endpoint |
| `API_KEYS` | optional | required |
| `SOLANA_RPC_URL` | devnet | devnet → mainnet |
| `REDIS_URL` | optional | recommended |

### Web (`gridlock-web/.env`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Router URL |
| `NEXT_PUBLIC_DEMO_MODE` | Show mock stats |
| `NEXT_PUBLIC_LOCK_MINT` | LOCK token mint for stake UI |

### Worker desktop

| Variable | Purpose |
|----------|---------|
| `GRIDLOCK_ROUTER_URL` | Default router API |
| `GRIDLOCK_TUNNEL` | `cloudflare` / `ngrok` / `none` |
| `INFERENCE_BACKEND` | `ollama` / `vllm` |

---

## v1 Scope (Explicitly In)

- Windows + NVIDIA
- Ollama sidecar, one recommended model (8B class)
- Electron UI: wallet, start/stop, earnings dashboard
- Register + heartbeat to router
- Router production mode rejects shared Groq workers
- Devnet LOCK + partial settlement

## v1 Scope (Explicitly Out)

- Prefill / Decode disaggregation
- Confidential TEE attestation
- Watcher network (Phase 4)
- Full on-chain escrow (Phase 3 — can trail desktop MVP by one sprint)
- macOS / AMD / CPU-only inference
- x402 agent payments (docs mention Q3 — keep as future)

---

## Suggested Build Order (Sprints)

| Sprint | Focus | Deliverable |
|--------|-------|-------------|
| 1 | Phase 0 + router flags | Demo vs prod split, README honesty |
| 2 | Phase 1 scaffold | `apps/worker-desktop` shell, Ollama spawn, register/heartbeat |
| 3 | Phase 1 polish | GPU detect, model download UI, dashboard |
| 4 | Phase 2 | Router validation, multi-worker routing |
| 5 | Phase 3 | `open_job` escrow on devnet |
| 6 | Phase 5 | Web mock removal, download CTA |
| 7 | Phase 6 | Signed Windows installer |

---

## Open Decisions

Record choices here as the team decides:

| Decision | Options | Status |
|----------|---------|--------|
| Desktop framework | Electron vs Tauri | **Recommend Electron** for v1 (faster, wallet ecosystem) |
| Inference sidecar v1 | Ollama vs bundled vLLM | **Recommend Ollama** |
| Home worker connectivity | User port-forward vs built-in tunnel | **Recommend Cloudflare Tunnel** for UX |
| Customer payment v1 | On-chain escrow vs off-chain credits first | **Recommend off-chain credits for MVP**, escrow in Phase 3 |
| Decode workers | Implement P/D vs single-role workers | **Recommend single Prefill role** until scale requires split |

---

## How to Use This Plan

1. Pick the next unchecked phase/task.
2. Implement on a feature branch.
3. Mark tasks `[x]` in this file when merged.
4. Do not skip Phase 0 — it prevents shipping misleading demos as production.
5. **Phase 1 (worker desktop)** is the highest-leverage user-facing work; prioritize after Phase 0.

---

## Related Files

| Path | Role |
|------|------|
| `gridlock-backend/src/` | Router — worker registry, routing, settlement |
| `gridlock-web/` | Customer dashboard |
| `gridlock/programs/` | On-chain programs |
| `gridlock/scripts/create-lock-mint.ts` | LOCK token setup |
| `README.md` | Public overview (keep in sync with this plan) |

---

*Last updated: 2025-06-21*
