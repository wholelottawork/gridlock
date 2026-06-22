"""
/v1/workers  — registration, heartbeat, listing, detail.
"""
import time
import uuid

from fastapi import APIRouter, HTTPException

from models import RegisterWorkerBody, HeartbeatBody
from state import state

router = APIRouter(prefix="/v1")

# SLA tiers unlocked by hardware tier
_TIER_UNLOCKS: dict[str, list[str]] = {
    "H100":    ["Nano", "Micro", "Batch", "Realtime"],
    "A100":    ["Nano", "Micro", "Batch", "Realtime"],
    "RTX 4090":["Nano", "Micro", "Batch"],
    "RTX 3090":["Nano", "Micro"],
    "RTX 3080":["Nano"],
}


@router.post("/workers/register")
def register_worker(body: RegisterWorkerBody):
    address = body.operator_pubkey or f"worker_{uuid.uuid4().hex[:12]}"
    sla_tiers = _TIER_UNLOCKS.get(body.hardware_tier, ["Nano", "Micro"])

    worker = {
        "address":          address,
        "role":             body.role,
        "endpoint":         body.endpoint or "",
        "sla_tiers":        sla_tiers,
        "tee_capable":      body.tee_capable,
        "hardware_tier":    body.hardware_tier,
        "status":           "active",
        "staked_lock":      body.staked_lock or 0.0,
        "reliability_score": 100.0,
        "goodput_score":    0.0,
        "sla_pass_rate":    1.0,
        "p99_ttft_ms":      0.0,
        "jobs_today":       0,
        "earnings_today":   0.0,
        "penalties_paid":   0.0,
        "is_confidential":  body.tee_capable,
        "last_heartbeat":   time.time(),
        "registered_at":    time.time(),
        "grid_points":      0,
    }

    with state.lock:
        state.workers[address] = worker
        state.events.append({"type": "worker_registered", "address": address, "hardware": body.hardware_tier})

    return {
        "success": True,
        "address": address,
        "tx_sig":  f"sig_{uuid.uuid4().hex}",
    }


@router.post("/workers/heartbeat")
def worker_heartbeat(body: HeartbeatBody):
    with state.lock:
        w = state.workers.get(body.worker_address)
        if not w:
            raise HTTPException(404, "Worker not registered")
        w["last_heartbeat"] = time.time()
        w["status"] = "active"
        if body.goodput_score is not None:
            w["goodput_score"] = round(body.goodput_score, 2)
    return {"ok": True}


@router.get("/workers")
def list_workers(
    status: str | None = None,
    tee_capable: bool | None = None,
    limit: int = 50,
):
    with state.lock:
        workers = list(state.workers.values())
    if status:
        workers = [w for w in workers if w["status"] == status]
    if tee_capable is not None:
        workers = [w for w in workers if w["tee_capable"] == tee_capable]
    return {"workers": workers[:limit], "total": len(workers)}


@router.get("/workers/{address}")
def get_worker(address: str):
    with state.lock:
        w = state.workers.get(address)
        if not w:
            raise HTTPException(404, "Worker not found")
        recent_jobs = sorted(
            [j for j in state.jobs.values() if j.get("worker_address") == address],
            key=lambda j: j["ts"],
            reverse=True,
        )[:20]
    return {**w, "recent_jobs": recent_jobs}
