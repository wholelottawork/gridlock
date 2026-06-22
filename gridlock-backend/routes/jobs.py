"""
/v1/jobs  — list, get, poll (worker pull), complete.
"""
import time

from fastapi import APIRouter, HTTPException

import config
from models import CompleteJobBody
from state import state

router = APIRouter(prefix="/v1")


@router.get("/jobs")
def list_jobs(
    limit: int = 20,
    offset: int = 0,
    sla_tier: str | None = None,
    sla_met: bool | None = None,
    worker: str | None = None,
):
    with state.lock:
        jobs = list(state.jobs.values())

    if sla_tier:
        jobs = [j for j in jobs if j.get("sla_tier") == sla_tier]
    if sla_met is not None:
        jobs = [j for j in jobs if j.get("sla_met") == sla_met]
    if worker:
        jobs = [j for j in jobs if j.get("worker_address") == worker]

    jobs = sorted(jobs, key=lambda j: j["ts"], reverse=True)
    return {"jobs": jobs[offset : offset + limit], "total": len(jobs)}


@router.get("/jobs/next")
def get_next_job(worker_address: str):
    """Worker daemon polls this to receive the next assigned job."""
    with state.lock:
        for job in state.jobs.values():
            if (
                job.get("worker_address") == worker_address
                and job.get("status") == "pending"
            ):
                job["status"] = "running"
                return job
    return None   # 200 + null = nothing queued


@router.post("/jobs/complete")
def complete_job(body: CompleteJobBody):
    """Worker daemon calls this when inference finishes."""
    with state.lock:
        job = state.jobs.get(body.job_id)
        if not job:
            raise HTTPException(404, "Job not found")

        sla_target = config.SLA_TARGETS.get(job.get("sla_tier", "standard"), 800)
        sla_met    = body.ttft_ms < sla_target
        fee        = (body.output_tokens / 1_000_000) * config.PRICE_PER_1M_TOKENS
        penalty    = round(fee * config.SLA_PENALTY_RATE, 6) if not sla_met else None

        job.update({
            "status":           "completed",
            "ttft_ms":          round(body.ttft_ms, 2),
            "tpot_ms":          round(body.tpot_ms, 2),
            "sla_met":          sla_met,
            "fee":              round(fee, 6),
            "penalty_paid":     penalty,
            "attestation_hash": body.attestation_hash,
        })

        w = state.workers.get(body.worker_address)
        if w:
            w["jobs_today"]    = w.get("jobs_today", 0) + 1
            w["earnings_today"] = round(
                w.get("earnings_today", 0) + fee * config.WORKER_SHARE, 6
            )
            if not sla_met and penalty:
                w["penalties_paid"] = round(w.get("penalties_paid", 0) + penalty, 6)
            total    = w["jobs_today"]
            prev     = round(w.get("sla_pass_rate", 1.0) * (total - 1))
            w["sla_pass_rate"]  = round((prev + (1 if sla_met else 0)) / total, 4)
            w["grid_points"]    = w.get("grid_points", 0) + body.output_tokens // 100
            w["status"]         = "active"

        state.events.append({"type": "job_completed", "job": job})

    return {"ok": True, "sla_met": sla_met, "fee": round(fee, 6)}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    with state.lock:
        job = state.jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job
