"""
POST /v1/chat/completions — OpenAI-compatible endpoint with Gridlock metadata.
Routes to OpenAI if OPENAI_API_KEY is set, otherwise returns a mock response.
"""
import random
import time
import uuid

import httpx
from fastapi import APIRouter

import config
from models import ChatCompletionRequest
from state import state

router = APIRouter()


# ── Inference backends ────────────────────────────────────────────────────────

async def _mock_inference(messages: list, model: str) -> dict:
    import asyncio
    await asyncio.sleep(random.uniform(0.15, 0.9))
    words = sum(len(m.content.split()) for m in messages)
    out_tokens = random.randint(60, 320)
    return {
        "content": (
            f"[Gridlock · {model}] "
            "This is a simulated response. "
            "Connect a real vLLM worker or add OPENAI_API_KEY to serve live completions."
        ),
        "prompt_tokens": words,
        "output_tokens": out_tokens,
        "ttft_ms": random.uniform(180, 750),
        "tpot_ms": random.uniform(18, 65),
    }


async def _openai_inference(messages: list, model: str, api_key: str) -> dict:
    t0 = time.perf_counter()
    target = model if model.startswith("gpt") else "gpt-4o-mini"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": target,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
            },
        )
        resp.raise_for_status()
        data = resp.json()

    elapsed = (time.perf_counter() - t0) * 1000
    return {
        "content": data["choices"][0]["message"]["content"],
        "prompt_tokens": data["usage"]["prompt_tokens"],
        "output_tokens": data["usage"]["completion_tokens"],
        "ttft_ms": elapsed * random.uniform(0.3, 0.5),   # approximate
        "tpot_ms": elapsed / max(data["usage"]["completion_tokens"], 1),
    }


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    sla     = req.gridlock.sla     if req.gridlock else "standard"
    privacy = req.gridlock.privacy if req.gridlock else False

    # Pick + reserve a worker
    worker = state.pick_worker(tee_required=bool(privacy))
    worker_addr = worker["address"] if worker else "gridlock-internal"
    worker_name = worker.get("hardware_tier", "internal") if worker else "internal"

    if worker:
        with state.lock:
            state.workers[worker_addr]["status"] = "busy"

    # Run inference
    try:
        if config.OPENAI_API_KEY:
            result = await _openai_inference(req.messages, req.model, config.OPENAI_API_KEY)
        else:
            result = await _mock_inference(req.messages, req.model)
    finally:
        if worker:
            with state.lock:
                if worker_addr in state.workers:
                    state.workers[worker_addr]["status"] = "active"

    ttft_ms      = result["ttft_ms"]
    tpot_ms      = result["tpot_ms"]
    out_tokens   = result["output_tokens"]
    sla_target   = config.SLA_TARGETS.get(sla, 800)
    sla_met      = ttft_ms < sla_target
    fee          = (out_tokens / 1_000_000) * config.PRICE_PER_1M_TOKENS
    penalty_due  = round(fee * config.SLA_PENALTY_RATE, 6) if not sla_met else None
    attest_hash  = (
        "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:32] if privacy else None
    )

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = {
        "id":               job_id,
        "customer":         "api",
        "model":            req.model,
        "sla_tier":         sla,
        "worker":           worker_name,
        "worker_address":   worker_addr,
        "status":           "completed",
        "ttft_ms":          round(ttft_ms, 2),
        "tpot_ms":          round(tpot_ms, 2),
        "sla_met":          sla_met,
        "confidential":     bool(privacy),
        "fee":              round(fee, 6),
        "penalty_paid":     penalty_due,
        "attestation_hash": attest_hash,
        "ts":               time.time(),
    }

    with state.lock:
        state.jobs[job_id] = job
        if worker and worker_addr in state.workers:
            w = state.workers[worker_addr]
            w["jobs_today"]    = w.get("jobs_today", 0) + 1
            w["earnings_today"] = round(
                w.get("earnings_today", 0) + fee * config.WORKER_SHARE, 6
            )
            w["goodput_score"] = round(
                w.get("goodput_score", 0) + out_tokens / 1000, 2
            )
            total = w["jobs_today"]
            prev_pass = round(w.get("sla_pass_rate", 1.0) * (total - 1))
            w["sla_pass_rate"] = round((prev_pass + (1 if sla_met else 0)) / total, 4)
            w["grid_points"]   = w.get("grid_points", 0) + out_tokens // 100
        state.events.append({"type": "job_completed", "job": job})

    gridlock_meta = {
        "job_id":              job_id,
        "ttft_ms":             round(ttft_ms, 2),
        "tpot_ms":             round(tpot_ms, 2),
        "sla_tier":            sla,
        "sla_met":             sla_met,
        "sla_target_ttft_ms":  sla_target,
        "worker":              worker_name,
        "confidential":        bool(privacy),
        "penalty_due_lock":    penalty_due,
        "fee_lock":            round(fee, 6),
        "attestation_hash":    attest_hash,
    }

    return {
        "id":      f"chatcmpl-{job_id}",
        "object":  "chat.completion",
        "created": int(time.time()),
        "model":   req.model,
        "choices": [{
            "index":         0,
            "message":       {"role": "assistant", "content": result["content"]},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens":     result["prompt_tokens"],
            "completion_tokens": out_tokens,
            "total_tokens":      result["prompt_tokens"] + out_tokens,
        },
        "gridlock": gridlock_meta,
    }
