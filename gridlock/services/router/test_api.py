"""
Gridlock Router — API test suite
Run: python test_api.py [--base http://localhost:8080] [--key sk-grid-yourkey]
"""

import argparse
import asyncio
import json
import sys
import time

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--base", default="http://localhost:8080")
parser.add_argument("--key",  default="")
args = parser.parse_args()

BASE    = args.base
HEADERS = {"Authorization": f"Bearer {args.key}"} if args.key else {}

PASS = "\033[92m PASS\033[0m"
FAIL = "\033[91m FAIL\033[0m"
results: list[tuple[str, bool, str]] = []

def check(name: str, ok: bool, detail: str = "") -> None:
    tag = PASS if ok else FAIL
    print(f"  [{tag}] {name}{(' — ' + detail) if detail else ''}")
    results.append((name, ok, detail))

async def run() -> None:
    async with httpx.AsyncClient(base_url=BASE, headers=HEADERS, timeout=15.0) as c:

        # ── Health ────────────────────────────────────────────────────────────
        print("\n── /health")
        r = await c.get("/health")
        check("status 200",   r.status_code == 200)
        check("status=ok",    r.json().get("status") == "ok")
        check("programs key", "programs" in r.json())

        # ── Network stats ─────────────────────────────────────────────────────
        print("\n── /v1/network/stats")
        r = await c.get("/v1/network/stats")
        check("status 200",            r.status_code == 200)
        d = r.json()
        for field in ["active_workers","idle_workers","tee_workers","jobs_total",
                      "jobs_1h","sla_pass_rate","p99_ttft_ms","total_penalties_lock",
                      "confidential_share","lock_burned"]:
            check(f"field: {field}", field in d)

        # ── Workers ───────────────────────────────────────────────────────────
        print("\n── /v1/workers")
        r = await c.get("/v1/workers")
        check("status 200",   r.status_code == 200)
        check("has workers",  r.json().get("total", 0) > 0)

        r2 = await c.get("/v1/workers?tee_capable=true")
        check("tee filter",   r2.status_code == 200)

        r3 = await c.get("/v1/workers?status=Active")
        check("status filter", r3.status_code == 200)

        first_addr = r.json()["workers"][0]["address"] if r.json()["workers"] else None
        if first_addr:
            r4 = await c.get(f"/v1/workers/{first_addr[:8]}")
            check("worker detail", r4.status_code == 200)
            check("recent_jobs key", "recent_jobs" in r4.json())

        # ── Jobs ──────────────────────────────────────────────────────────────
        print("\n── /v1/jobs")
        r = await c.get("/v1/jobs")
        check("status 200",  r.status_code == 200)
        check("has jobs",    r.json().get("total", 0) > 0)

        r2 = await c.get("/v1/jobs?sla_tier=realtime")
        check("sla_tier filter", r2.status_code == 200)

        r3 = await c.get("/v1/jobs?sla_met=false")
        check("sla_met filter",  r3.status_code == 200)

        first_job_id = r.json()["jobs"][0]["id"] if r.json()["jobs"] else None
        if first_job_id:
            r4 = await c.get(f"/v1/jobs/{first_job_id}")
            check("job detail", r4.status_code == 200)

        r5 = await c.get(f"/v1/jobs/nonexistent-id-000")
        check("404 on bad id", r5.status_code == 404)

        # ── Leaderboard ───────────────────────────────────────────────────────
        print("\n── /v1/leaderboard")
        for metric in ["goodput", "reliability", "confidential", "earnings"]:
            r = await c.get(f"/v1/leaderboard?metric={metric}")
            check(f"metric={metric}", r.status_code == 200 and "ranked" in r.json())

        # ── Chat completions — non-streaming ──────────────────────────────────
        print("\n── /v1/chat/completions (non-streaming)")
        t0 = time.perf_counter()
        r = await c.post("/v1/chat/completions", json={
            "model": "llama-3.1-8b",
            "messages": [{"role": "user", "content": "Say hello"}],
            "stream": False,
            "gridlock": {"sla": "standard", "privacy": False},
        })
        elapsed = int((time.perf_counter() - t0) * 1000)
        check("status 200",      r.status_code == 200, f"{elapsed}ms")
        d = r.json()
        check("choices key",     "choices" in d)
        check("gridlock key",    "gridlock" in d)
        check("job_id present",  "job_id" in d.get("gridlock", {}))
        check("ttft_ms present", "ttft_ms" in d.get("gridlock", {}))
        check("fee_lock present","fee_lock" in d.get("gridlock", {}))

        # ── Chat completions — realtime tier ──────────────────────────────────
        print("\n── /v1/chat/completions (realtime SLA)")
        r = await c.post("/v1/chat/completions", json={
            "model": "llama-3.1-70b",
            "messages": [{"role": "user", "content": "ping"}],
            "gridlock": {"sla": "realtime"},
        })
        check("status 200", r.status_code == 200)
        g = r.json().get("gridlock", {})
        check("sla_tier=realtime", g.get("sla_tier") == "realtime")
        check("fee > standard",    g.get("fee_lock", 0) > 0.05)

        # ── Chat completions — streaming ──────────────────────────────────────
        print("\n── /v1/chat/completions (stream=true)")
        chunks: list[str] = []
        async with c.stream("POST", "/v1/chat/completions", json={
            "model": "llama-3.1-8b",
            "messages": [{"role": "user", "content": "Count to 3"}],
            "stream": True,
        }) as resp:
            check("status 200", resp.status_code == 200)
            check("content-type SSE", "text/event-stream" in resp.headers.get("content-type", ""))
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    chunks.append(line)
        check("received chunks", len(chunks) > 0, f"{len(chunks)} chunks")
        check("ends with DONE",  chunks[-1].strip() == "data: [DONE]")

        # ── Worker register + heartbeat ───────────────────────────────────────
        print("\n── /v1/workers/register + heartbeat")
        test_addr = "TestWorkerGridlockAAAAAAAAAAAAAAAAAAAAAAAAAA"
        r = await c.post("/v1/workers/register", json={
            "operator_pubkey": test_addr,
            "role": "Prefill",
            "hardware_tier": "RTX 4090",
            "tee_capable": False,
        })
        check("register 200",    r.status_code == 200)
        check("success=true",    r.json().get("success") is True)

        r2 = await c.post("/v1/workers/register", json={
            "operator_pubkey": test_addr,
            "role": "Prefill", "hardware_tier": "RTX 4090",
        })
        check("duplicate = 409", r2.status_code == 409)

        r3 = await c.post("/v1/workers/heartbeat", json={
            "worker_address": test_addr,
            "goodput_score": 750,
        })
        check("heartbeat 200",   r3.status_code == 200)
        check("status Active",   r3.json().get("status") == "Active")

        r4 = await c.post("/v1/workers/heartbeat", json={"worker_address": "nonexistent"})
        check("heartbeat 404",   r4.status_code == 404)

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "─" * 50)
    passed = sum(1 for _, ok, _ in results if ok)
    total  = len(results)
    print(f"  {passed}/{total} passed")
    if passed < total:
        print("\n  Failed:")
        for name, ok, detail in results:
            if not ok:
                print(f"    ✗ {name} {detail}")
        sys.exit(1)
    else:
        print("  All tests passed.")

asyncio.run(run())
