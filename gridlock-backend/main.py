"""
Gridlock Backend API  —  FastAPI entry point.
Run with:  uvicorn main:app --host 0.0.0.0 --port 8080 --reload
"""
import asyncio
import time

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from state import state
from routes import chat, workers, jobs, network, live

app = FastAPI(
    title="Gridlock API",
    version="0.1.0",
    description="Decentralised AI inference network — worker registry, job routing, live stream.",
)

# CORS — allow the Next.js frontend (any origin in dev; tighten for prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(chat.router)
app.include_router(workers.router)
app.include_router(jobs.router)
app.include_router(network.router)
app.include_router(live.router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    with state.lock:
        active = sum(1 for w in state.workers.values() if w["status"] == "active")
        total_w = len(state.workers)
        total_j = len(state.jobs)
    return {
        "status":         "ok",
        "solana_slot":    state.solana_slot,
        "active_workers": active,
        "total_workers":  total_w,
        "jobs_tracked":   total_j,
        "redis":          "in-memory",
        "supabase":       "in-memory",
        "programs":       {"gridlock": config.GRIDLOCK_PROGRAM_ID},
    }


# ── Background tasks ──────────────────────────────────────────────────────────

async def _background():
    """Evict stale workers + tick mock Solana slot."""
    while True:
        await asyncio.sleep(10)
        now = time.time()
        with state.lock:
            for w in state.workers.values():
                if w["status"] != "offline" and now - w.get("last_heartbeat", 0) > 90:
                    w["status"] = "offline"
                    state.events.append({"type": "worker_offline", "address": w["address"]})
            state.solana_slot += 4   # ~1 slot / 400 ms * 10 s


@app.on_event("startup")
async def startup():
    asyncio.create_task(_background())


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = config.PORT if config.PORT != 8080 else 3001
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
