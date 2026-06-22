#!/usr/bin/env python3
"""
Gridlock Worker Daemon
- Detects local GPU via nvidia-smi
- Registers with the Gridlock backend (BACKEND_URL)
- Sends heartbeats every 30 s
- Polls for jobs and simulates/runs inference
- Exposes a local HTTP API on :7420 for the Electron UI
"""

import argparse
import json
import os
import random
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Config ────────────────────────────────────────────────────────────────────

BACKEND_URL  = os.getenv("GRIDLOCK_BACKEND_URL", "http://localhost:8080")
WALLET_ADDR  = os.getenv("GRIDLOCK_WALLET", "")
HARDWARE_TIER = os.getenv("GRIDLOCK_HW_TIER", "RTX 4090")
ROLE          = os.getenv("GRIDLOCK_ROLE", "Decode")
TEE_CAPABLE   = os.getenv("GRIDLOCK_TEE", "false").lower() == "true"

# ── State ─────────────────────────────────────────────────────────────────────

state = {
    "running":        False,
    "backend_ok":     False,
    "worker_address": WALLET_ADDR or "",
    "gpu": {
        "name":         "Detecting…",
        "vram_used_gb": 0.0,
        "vram_total_gb": 0.0,
        "utilization":  0,
        "temperature":  45,
        "power_w":      80,
        "power_max_w":  350,
    },
    "active_job":     None,
    "jobs":           [],
    "tokens_per_sec": 0,
    "jobs_today":     0,
    "earnings": {
        "today": 0.0,
        "week":  0.0,
        "total": 0.0,
        "history": [],
    },
}

_worker_thread: threading.Thread | None = None

# ── GPU detection ─────────────────────────────────────────────────────────────

def detect_gpu() -> bool:
    try:
        out = subprocess.check_output(
            ["nvidia-smi",
             "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.max.limit",
             "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, timeout=5,
        ).decode().strip().splitlines()[0]
        p = [x.strip() for x in out.split(",")]
        state["gpu"] = {
            "name":          p[0],
            "vram_used_gb":  round(float(p[1]) / 1024, 1),
            "vram_total_gb": round(float(p[2]) / 1024, 1),
            "utilization":   int(float(p[3])),
            "temperature":   int(float(p[4])),
            "power_w":       round(float(p[5])),
            "power_max_w":   round(float(p[6])),
        }
        return True
    except Exception:
        state["gpu"] = {
            "name":          f"{HARDWARE_TIER} (mock)",
            "vram_used_gb":  16.2,
            "vram_total_gb": 24.0,
            "utilization":   0,
            "temperature":   45,
            "power_w":       80,
            "power_max_w":   450,
        }
        log({"event": "gpu_mock", "msg": "nvidia-smi not found — running mock GPU"})
        return False


def refresh_gpu():
    try:
        out = subprocess.check_output(
            ["nvidia-smi",
             "--query-gpu=utilization.gpu,temperature.gpu,power.draw,memory.used",
             "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, timeout=3,
        ).decode().strip().splitlines()[0]
        p = [x.strip() for x in out.split(",")]
        state["gpu"]["utilization"]  = int(float(p[0]))
        state["gpu"]["temperature"]  = int(float(p[1]))
        state["gpu"]["power_w"]      = round(float(p[2]))
        state["gpu"]["vram_used_gb"] = round(float(p[3]) / 1024, 1)
    except Exception:
        pass   # mock mode — worker loop drives the numbers

# ── Backend API helpers ───────────────────────────────────────────────────────

def _req(method: str, path: str, body: dict | None = None) -> dict | None:
    url  = f"{BACKEND_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, method=method,
                                   headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        log({"event": "backend_error", "path": path, "err": str(e)})
        return None


def register_with_backend():
    gpu_name = state["gpu"]["name"].replace(" (mock)", "")
    result = _req("POST", "/v1/workers/register", {
        "operator_pubkey": state["worker_address"] or f"worker_{random.randint(10000,99999)}",
        "role":            ROLE,
        "hardware_tier":   gpu_name,
        "tee_capable":     TEE_CAPABLE,
        "endpoint":        f"http://localhost:7420",
        "staked_lock":     0,
    })
    if result and result.get("success"):
        state["worker_address"] = result["address"]
        state["backend_ok"]     = True
        log({"event": "registered", "address": state["worker_address"]})
    else:
        state["backend_ok"] = False
        log({"event": "register_failed", "msg": "backend unreachable — running standalone"})


def send_heartbeat():
    if not state["backend_ok"]:
        return
    _req("POST", "/v1/workers/heartbeat", {
        "worker_address": state["worker_address"],
        "goodput_score":  state["tokens_per_sec"],
    })


def fetch_next_job() -> dict | None:
    if not state["backend_ok"] or not state["worker_address"]:
        return None
    return _req("GET", f"/v1/jobs/next?worker_address={state['worker_address']}")


def complete_job_backend(job_id: str, ttft_ms: float, tpot_ms: float, output_tokens: int):
    if not state["backend_ok"]:
        return
    _req("POST", "/v1/jobs/complete", {
        "job_id":         job_id,
        "worker_address": state["worker_address"],
        "ttft_ms":        ttft_ms,
        "tpot_ms":        tpot_ms,
        "output_tokens":  output_tokens,
    })

# ── Heartbeat loop ────────────────────────────────────────────────────────────

def heartbeat_loop():
    while True:
        time.sleep(30)
        if state["running"]:
            send_heartbeat()

# ── Worker inference loop ─────────────────────────────────────────────────────

TIERS       = ["Nano", "Micro", "Batch", "Realtime"]
TOKEN_OPTS  = [512, 1024, 2048, 4096]
PRICE_PER_1M = 8.5


def worker_loop():
    while state["running"]:
        # Try to get a real job from the backend
        real_job = fetch_next_job()

        if real_job:
            job_id  = real_job["id"]
            tokens  = real_job.get("output_tokens", random.choice(TOKEN_OPTS))
            tier    = real_job.get("sla_tier", "Batch")
        else:
            # Standalone mock job
            time.sleep(random.uniform(2.5, 6.0))
            if not state["running"]:
                break
            job_id = f"local_{random.randint(0, 0xFFFFFF):06x}"
            tokens = random.choice(TOKEN_OPTS)
            tier   = random.choice(TIERS)

        # Spin up GPU metrics
        state["gpu"]["utilization"]  = random.randint(72, 96)
        state["gpu"]["vram_used_gb"] = round(random.uniform(14, 22), 1)
        state["gpu"]["temperature"]  = random.randint(68, 82)
        state["gpu"]["power_w"]      = random.randint(340, 420)
        tps = random.randint(2000, 3400)
        state["tokens_per_sec"] = tps

        state["active_job"] = {"id": job_id, "tokens": tokens, "tier": tier, "progress": 0.0}
        log({"event": "job_start", "id": job_id, "tokens": tokens, "tier": tier})

        # Simulate inference
        t0       = time.time()
        progress = 0.0
        while progress < 100 and state["running"]:
            progress += random.uniform(4, 16)
            state["active_job"]["progress"] = min(progress, 100.0)
            refresh_gpu()
            time.sleep(0.25)

        if not state["running"]:
            break

        elapsed_ms = (time.time() - t0) * 1000
        ttft_ms    = elapsed_ms * random.uniform(0.1, 0.3)
        tpot_ms    = elapsed_ms / max(tokens, 1)
        fail       = random.random() < 0.04
        earn       = round((tokens / 1_000_000) * PRICE_PER_1M, 4) if not fail else 0.0

        record = {
            "id":          job_id,
            "status":      "failed" if fail else "completed",
            "tokens":      tokens,
            "tier":        tier,
            "earn":        earn,
            "duration_ms": round(elapsed_ms),
            "ts":          time.time(),
        }
        state["jobs"].insert(0, record)
        state["jobs"] = state["jobs"][:100]
        state["active_job"] = None

        if not fail:
            state["earnings"]["today"]  = round(state["earnings"]["today"] + earn, 4)
            state["earnings"]["week"]   = round(state["earnings"]["week"]  + earn, 4)
            state["earnings"]["total"]  = round(state["earnings"]["total"] + earn, 4)
            state["jobs_today"]        += 1
            complete_job_backend(job_id, ttft_ms, tpot_ms, tokens)

        log({"event": "job_done", "id": job_id, "status": record["status"], "earn": earn})

        # Cool down
        state["gpu"]["utilization"] = random.randint(5, 20)
        state["tokens_per_sec"]     = 0

# ── Local HTTP API (for Electron UI) ─────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/status":
            self._json({
                "running":        state["running"],
                "backend_ok":     state["backend_ok"],
                "worker_address": state["worker_address"],
                "gpu":            state["gpu"],
                "active_job":     state["active_job"],
                "tokens_per_sec": state["tokens_per_sec"],
                "jobs_today":     state["jobs_today"],
                "earnings_today": state["earnings"]["today"],
            })
        elif self.path == "/jobs":
            self._json({"jobs": state["jobs"][:30]})
        elif self.path == "/earnings":
            self._json(state["earnings"])
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        global _worker_thread
        if self.path == "/worker/start":
            if not state["running"]:
                state["running"] = True
                send_heartbeat()
                _worker_thread = threading.Thread(target=worker_loop, daemon=True)
                _worker_thread.start()
            self._json({"ok": True, "backend_ok": state["backend_ok"]})

        elif self.path == "/worker/stop":
            state["running"]        = False
            state["active_job"]     = None
            state["gpu"]["utilization"] = 0
            state["tokens_per_sec"] = 0
            send_heartbeat()
            self._json({"ok": True})

        else:
            self._json({"error": "not found"}, 404)

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: dict):
    print(json.dumps(msg), flush=True)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port",    type=int, default=7420)
    parser.add_argument("--backend", default=BACKEND_URL)
    parser.add_argument("--wallet",  default=WALLET_ADDR)
    args = parser.parse_args()

    BACKEND_URL              = args.backend
    state["worker_address"]  = args.wallet or ""

    detect_gpu()
    register_with_backend()

    # Background heartbeat
    hb = threading.Thread(target=heartbeat_loop, daemon=True)
    hb.start()

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    log({"event": "ready", "port": args.port, "gpu": state["gpu"]["name"],
         "backend": BACKEND_URL, "backend_ok": state["backend_ok"]})

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log({"event": "shutdown"})
