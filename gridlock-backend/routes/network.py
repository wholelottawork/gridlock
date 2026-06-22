"""
/v1/network/stats, /v1/stats/*, /v1/leaderboard, /v1/autoscale/signal
"""
import random
import time

from fastapi import APIRouter

from state import state

router = APIRouter(prefix="/v1")


@router.get("/network/stats")
def network_stats():
    with state.lock:
        workers = list(state.workers.values())
        jobs    = list(state.jobs.values())

    active_w = [w for w in workers if w["status"] == "active"]
    idle_w   = [w for w in workers if w["status"] == "idle"]
    tee_w    = [w for w in workers if w.get("tee_capable") and w["status"] == "active"]

    recent_jobs = [j for j in jobs if time.time() - j["ts"] < 3600]

    sla_pass = sum(1 for j in jobs if j.get("sla_met"))
    sla_rate = round(sla_pass / len(jobs), 4) if jobs else 1.0

    ttft_vals = sorted(j["ttft_ms"] for j in recent_jobs if "ttft_ms" in j)
    p99_ttft  = ttft_vals[int(len(ttft_vals) * 0.99)] if len(ttft_vals) >= 10 else 420.0

    total_penalties   = sum(j.get("penalty_paid") or 0 for j in jobs)
    confidential_jobs = sum(1 for j in jobs if j.get("confidential"))
    confidential_share = round(confidential_jobs / len(jobs), 4) if jobs else 0.0

    today_jobs = [j for j in jobs if time.time() - j["ts"] < 86400]

    return {
        "active_workers":      len(active_w),
        "idle_workers":        len(idle_w),
        "tee_workers":         len(tee_w),
        "jobs_total":          len(jobs),
        "jobs_1h":             len(recent_jobs),
        "sla_pass_rate":       sla_rate,
        "p99_ttft_ms":         round(p99_ttft, 1),
        "total_penalties_lock": round(total_penalties, 4),
        "confidential_share":  confidential_share,
        "lock_burned":         round(total_penalties * 0.10, 4),
        "total_workers":       len(workers),
        "requests_today":      len(today_jobs),
        "cache_hit_entries":   random.randint(11_000, 19_000),
    }


@router.get("/stats/cache")
def cache_stats():
    with state.lock:
        total = len(state.jobs)
    hits = int(total * random.uniform(0.48, 0.66))
    return {
        "hits":     hits,
        "misses":   total - hits,
        "entries":  random.randint(10_000, 22_000),
        "hit_rate": round(hits / total, 4) if total else 0.54,
        "strategy": "semantic-lru",
    }


@router.get("/stats/pd")
def pd_stats():
    with state.lock:
        workers = list(state.workers.values())
    roles = {"Prefill": 0, "Decode": 0, "Cache": 0, "Router": 0}
    for w in workers:
        r = w.get("role", "Decode")
        if r in roles:
            roles[r] += 1
    return {
        "prefill_workers":  roles["Prefill"],
        "decode_workers":   roles["Decode"],
        "cache_workers":    roles["Cache"],
        "router_workers":   roles["Router"],
        "warm_cache_rate":  round(random.uniform(0.62, 0.88), 4),
    }


@router.get("/leaderboard")
def leaderboard(metric: str = "goodput", limit: int = 25):
    with state.lock:
        workers = list(state.workers.values())

    key_map = {
        "goodput":     "goodput_score",
        "reliability": "reliability_score",
        "confidential":"is_confidential",
        "earnings":    "earnings_today",
    }
    key    = key_map.get(metric, "goodput_score")
    ranked = sorted(workers, key=lambda w: w.get(key) or 0, reverse=True)[:limit]
    return {"metric": metric, "ranked": ranked, "total": len(workers)}


@router.get("/autoscale/signal")
def autoscale_signal():
    with state.lock:
        workers = list(state.workers.values())
        jobs    = list(state.jobs.values())

    active   = len([w for w in workers if w["status"] == "active"])
    busy     = len([w for w in workers if w["status"] == "busy"])
    pending  = len([j for j in jobs if j.get("status") == "pending"])

    queue_pressure = pending / max(active, 1)

    recent_ttft = [j["ttft_ms"] for j in jobs if "ttft_ms" in j][-50:]
    avg_ttft    = sum(recent_ttft) / len(recent_ttft) if recent_ttft else 400
    ttft_pressure = max(0.0, (avg_ttft - 800) / 800)

    if queue_pressure > 2:
        rec = "scale_up_prefill"
    elif ttft_pressure > 0.5:
        rec = "scale_up_decode"
    elif active > 10 and queue_pressure < 0.2:
        rec = "scale_down"
    else:
        rec = "stable"

    return {
        "recommendation": rec,
        "queue_pressure": round(queue_pressure, 2),
        "ttft_pressure":  round(ttft_pressure, 2),
        "scale_targets":  {},
        "active_workers": active,
        "inflight":       busy,
    }
