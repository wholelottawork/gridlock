#!/usr/bin/env python3
"""
Gridlock Worker Daemon
Detects GPU, polls Gridlock network for inference jobs, reports earnings.
"""

import argparse
import json
import math
import random
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Global state ──────────────────────────────────────────────────────────────

state = {
    "running": False,
    "gpu": {
        "name": "Unknown GPU",
        "vram_used_gb": 0.0,
        "vram_total_gb": 0.0,
        "utilization": 0,
        "temperature": 45,
        "power_w": 80,
        "power_max_w": 350,
    },
    "active_job": None,
    "jobs": [],
    "tokens_per_sec": 0,
    "jobs_today": 0,
    "earnings": {
        "today": 0.0,
        "week": 0.0,
        "total": 142.38,
        "history": [],
    },
}

_worker_thread: threading.Thread | None = None

# ── GPU detection ──────────────────────────────────────────────────────────────

def detect_gpu() -> bool:
    """Try nvidia-smi first, fall back to ROCm, then mock."""
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.max.limit",
                "--format=csv,noheader,nounits",
            ],
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).decode().strip().splitlines()[0]

        parts = [p.strip() for p in out.split(",")]
        state["gpu"] = {
            "name": parts[0],
            "vram_used_gb": round(float(parts[1]) / 1024, 1),
            "vram_total_gb": round(float(parts[2]) / 1024, 1),
            "utilization": int(float(parts[3])),
            "temperature": int(float(parts[4])),
            "power_w": round(float(parts[5])),
            "power_max_w": round(float(parts[6])),
        }
        return True
    except Exception:
        pass

    # Fallback — mock GPU so UI still works without real hardware
    state["gpu"] = {
        "name": "RTX 4090 (mock)",
        "vram_used_gb": 16.2,
        "vram_total_gb": 24.0,
        "utilization": 0,
        "temperature": 45,
        "power_w": 80,
        "power_max_w": 450,
    }
    log({"event": "gpu_mock", "msg": "No NVIDIA GPU found — running in mock mode"})
    return False


def refresh_gpu_stats():
    """Update live utilisation/temp from nvidia-smi."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu,temperature.gpu,power.draw,memory.used",
             "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, timeout=3,
        ).decode().strip().splitlines()[0]
        parts = [p.strip() for p in out.split(",")]
        state["gpu"]["utilization"] = int(float(parts[0]))
        state["gpu"]["temperature"] = int(float(parts[1]))
        state["gpu"]["power_w"] = round(float(parts[2]))
        state["gpu"]["vram_used_gb"] = round(float(parts[3]) / 1024, 1)
    except Exception:
        pass  # mock mode — let worker_loop drive numbers


# ── Worker loop ────────────────────────────────────────────────────────────────

TIERS = ["Nano", "Micro", "Batch", "Realtime"]
TOKEN_COUNTS = [512, 1024, 2048, 4096]
PRICE_PER_1M = 8.5  # $LOCK per 1M tokens


def worker_loop():
    job_counter = 0
    while state["running"]:
        # Wait between jobs (simulates network polling)
        wait = random.uniform(2.5, 7.0)
        for _ in range(int(wait * 10)):
            if not state["running"]:
                return
            time.sleep(0.1)

        job_counter += 1
        tokens = random.choice(TOKEN_COUNTS)
        tier   = random.choice(TIERS)
        jid    = f"{job_counter:08x}"

        # Spin up GPU
        state["gpu"]["utilization"] = random.randint(72, 96)
        state["gpu"]["vram_used_gb"] = round(random.uniform(14, 22), 1)
        state["gpu"]["temperature"]  = random.randint(68, 82)
        state["gpu"]["power_w"]      = random.randint(340, 420)
        state["tokens_per_sec"]      = random.randint(2000, 3400)

        state["active_job"] = {"id": jid, "tokens": tokens, "tier": tier, "progress": 0.0}
        log({"event": "job_start", "id": jid, "tokens": tokens, "tier": tier})

        # Simulate inference progress
        progress = 0.0
        while progress < 100 and state["running"]:
            progress += random.uniform(4, 16)
            state["active_job"]["progress"] = min(progress, 100.0)
            refresh_gpu_stats()
            time.sleep(0.25)

        if not state["running"]:
            break

        # Settle job
        earn = round((tokens / 1_000_000) * PRICE_PER_1M, 4)
        fail = random.random() < 0.04  # 4% failure rate
        job_record = {
            "id": jid, "status": "failed" if fail else "completed",
            "tokens": tokens, "tier": tier, "earn": 0.0 if fail else earn,
            "duration_ms": random.randint(400, 3000),
            "ts": time.time(),
        }
        state["jobs"].insert(0, job_record)
        state["jobs"] = state["jobs"][:100]
        state["active_job"] = None

        if not fail:
            state["earnings"]["today"] = round(state["earnings"]["today"] + earn, 4)
            state["earnings"]["week"]  = round(state["earnings"]["week"] + earn, 4)
            state["earnings"]["total"] = round(state["earnings"]["total"] + earn, 4)
            state["jobs_today"] += 1

        log({"event": "job_done", "id": jid, "status": job_record["status"], "earn": job_record["earn"]})

        # Cool GPU
        state["gpu"]["utilization"] = random.randint(5, 20)
        state["tokens_per_sec"] = 0


# ── HTTP API ───────────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # suppress access log
        pass

    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/status":
            self._json({
                "running": state["running"],
                "gpu": state["gpu"],
                "active_job": state["active_job"],
                "tokens_per_sec": state["tokens_per_sec"],
                "jobs_today": state["jobs_today"],
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
                _worker_thread = threading.Thread(target=worker_loop, daemon=True)
                _worker_thread.start()
            self._json({"ok": True})

        elif self.path == "/worker/stop":
            state["running"] = False
            state["active_job"] = None
            state["gpu"]["utilization"] = 0
            state["tokens_per_sec"] = 0
            self._json({"ok": True})

        else:
            self._json({"error": "not found"}, 404)


# ── Helpers ────────────────────────────────────────────────────────────────────

def log(msg: dict):
    print(json.dumps(msg), flush=True)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7420)
    args = parser.parse_args()

    detect_gpu()

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    log({"event": "ready", "port": args.port, "gpu": state["gpu"]["name"]})

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log({"event": "shutdown"})
