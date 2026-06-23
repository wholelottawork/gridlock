#!/usr/bin/env python3
"""
Gridlock Worker Daemon
- Detects local GPU via nvidia-smi
- Registers with the Gridlock backend (BACKEND_URL)
- Sends heartbeats every 30 s
- Polls for jobs and runs inference via Ollama/vLLM
- Exposes a local HTTP API on :7420 for the Electron UI
"""

import argparse
import hashlib
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import quote

from job_messages import prepare_inference_messages
import inference
import gpu_detect

# ── Config ────────────────────────────────────────────────────────────────────

BACKEND_URL  = os.getenv("GRIDLOCK_BACKEND_URL", "https://api.reacton.dev")
WALLET_ADDR  = os.getenv("GRIDLOCK_WALLET", "")
ROLE          = os.getenv("GRIDLOCK_ROLE", "Prefill")
TEE_CAPABLE   = os.getenv("GRIDLOCK_TEE", "false").lower() == "true"

# ── State ─────────────────────────────────────────────────────────────────────

state = {
    "running":        False,
    "backend_ok":     False,
    "last_backend_error": None,
    "inference_ready": False,
    "inference_error": None,
    "inference_backend": None,
    "worker_address": WALLET_ADDR or "",
    "gpu": gpu_detect.empty_gpu("Detecting…"),
    "gpu_detected": False,
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


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


_SSL_CTX = _ssl_context()

# ── GPU detection ─────────────────────────────────────────────────────────────

def detect_gpu() -> bool:
    stats = gpu_detect.read_gpu_stats()
    if stats:
        state["gpu"] = stats
        state["gpu_detected"] = True
        log({"event": "gpu_detected", "name": stats["name"], "vram_gb": stats["vram_total_gb"]})
        return True

    override = os.getenv("GRIDLOCK_HW_TIER", "").strip()
    state["gpu"] = gpu_detect.empty_gpu(
        override if override else "No NVIDIA GPU detected — install drivers or add nvidia-smi to PATH"
    )
    state["gpu_detected"] = False
    log({"event": "gpu_not_found", "msg": "nvidia-smi unavailable", "bin": gpu_detect._nvidia_smi_bin()})
    return False


def refresh_gpu():
    stats = gpu_detect.read_gpu_stats()
    if stats:
        state["gpu"].update(stats)
        state["gpu_detected"] = True

# ── Backend API helpers ───────────────────────────────────────────────────────

def compute_job_attestation_hash(job_id: str, worker_address: str, response: str) -> str:
    payload = json.dumps({
        "jobId": job_id,
        "workerAddress": worker_address,
        "response": response[:512],
    })
    return hashlib.sha256(payload.encode()).hexdigest()


def _req(method: str, path: str, body: dict | None = None) -> dict | None:
    url  = f"{BACKEND_URL.rstrip('/')}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Gridlock-Worker/0.1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as r:
            state["last_backend_error"] = None
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read())
        except Exception:
            err_body = {"error": str(e)}
        log({"event": "backend_error", "path": path, "status": e.code, "err": err_body})
        if e.code == 409:
            return {"error": "already_registered", "status": 409}
        state["last_backend_error"] = err_body.get("error") or f"HTTP {e.code} on {path}"
        return None
    except Exception as e:
        err = str(e)
        state["last_backend_error"] = err
        log({"event": "backend_error", "path": path, "err": err})
        return None


def register_with_backend():
    addr = (state["worker_address"] or "").strip()
    if not addr or len(addr) < 20:
        state["backend_ok"] = False
        log({"event": "register_skipped", "msg": "wallet required"})
        return

    gpu_name = state["gpu"]["name"]
    if gpu_name.startswith("No NVIDIA GPU"):
        gpu_name = os.getenv("GRIDLOCK_HW_TIER", "NVIDIA GPU")

    existing = _req("GET", f"/v1/workers/{quote(addr, safe='')}")
    if existing and existing.get("address"):
        state["worker_address"] = existing["address"]
        state["backend_ok"] = True
        send_heartbeat()
        log({"event": "registered", "address": state["worker_address"], "mode": "existing"})
        return

    result = _req("POST", "/v1/workers/register", {
        "operator_pubkey": addr,
        "role":            ROLE,
        "hardware_tier":   gpu_name,
        "tee_capable":     TEE_CAPABLE,
        "is_confidential": TEE_CAPABLE,
        "endpoint":        f"desktop://{gpu_name.lower().replace(' ', '-')}",
    })

    if result and result.get("success"):
        state["worker_address"] = result["address"]
        state["backend_ok"] = True
        log({"event": "registered", "address": state["worker_address"], "mode": "new"})
    elif result and result.get("status") == 409:
        state["worker_address"] = addr
        state["backend_ok"] = True
        send_heartbeat()
        log({"event": "registered", "address": state["worker_address"], "mode": "409_existing"})
    else:
        state["backend_ok"] = False
        if not state["last_backend_error"]:
            state["last_backend_error"] = "Could not register with Gridlock"
        log({"event": "register_failed", "msg": state["last_backend_error"]})


def send_heartbeat():
    if not state["backend_ok"]:
        return
    _req("POST", "/v1/workers/heartbeat", {
        "worker_address": state["worker_address"],
        "goodput_score":  state["tokens_per_sec"],
    })


def set_worker_status(status: str):
    addr = (state["worker_address"] or "").strip()
    if not addr or not state["backend_ok"]:
        return
    result = _req("POST", f"/v1/workers/{quote(addr, safe='')}/status", {"status": status})
    if result and result.get("ok"):
        log({"event": "status_updated", "status": status})
    else:
        log({"event": "status_update_failed", "status": status, "err": state.get("last_backend_error")})


def _ws_url() -> str:
    base = BACKEND_URL.rstrip("/")
    if base.startswith("https://"):
        return base.replace("https://", "wss://", 1) + "/v1/ws"
    return base.replace("http://", "ws://", 1) + "/v1/ws"


_ws_job_queue: list = []
_ws_job_lock = threading.Lock()
_ws_app = None
_active_ws = None


def _ws_on_message(_ws, message: str):
    try:
        msg = json.loads(message)
    except Exception:
        return
    if msg.get("type") == "job:new":
        with _ws_job_lock:
            _ws_job_queue.append(msg)
    elif msg.get("type") == "worker:registered":
        log({"event": "ws_ready", "address": msg.get("worker_address")})
    elif msg.get("type") == "error":
        log({"event": "ws_server_error", "msg": msg.get("message")})


def _ws_on_error(_ws, error):
    log({"event": "ws_error", "err": str(error)})


def _ws_on_close(_ws, code, msg):
    global _active_ws
    _active_ws = None
    log({"event": "ws_closed", "code": code, "msg": str(msg) if msg else ""})


def _ws_sslopt() -> dict | None:
    if not _ws_url().startswith("wss://"):
        return None
    try:
        import certifi
        return {"ca_certs": certifi.where(), "cert_reqs": ssl.CERT_REQUIRED}
    except ImportError:
        return {"cert_reqs": ssl.CERT_REQUIRED}


def _ws_on_open(ws):
    global _active_ws
    _active_ws = ws
    if not state["worker_address"]:
        return
    ws.send(json.dumps({
        "type": "worker:register",
        "worker_address": state["worker_address"],
        "worker_type": "desktop",
        "model": inference.get_active_model(),
        "tok_per_sec": max(state["tokens_per_sec"], 1),
    }))
    log({"event": "ws_registered"})


def ws_loop():
    global _ws_app
    try:
        import websocket  # websocket-client
    except ImportError:
        log({"event": "ws_unavailable", "msg": "pip install websocket-client for WebSocket jobs"})
        return

    while state["running"]:
        try:
            ws_kwargs: dict = {
                "ping_interval": 30,
                "ping_timeout": 10,
            }
            sslopt = _ws_sslopt()
            if sslopt:
                ws_kwargs["sslopt"] = sslopt
            _ws_app = websocket.WebSocketApp(
                _ws_url(),
                on_message=_ws_on_message,
                on_open=_ws_on_open,
                on_error=_ws_on_error,
                on_close=_ws_on_close,
            )
            _ws_app.run_forever(**ws_kwargs)
        except Exception as e:
            log({"event": "ws_error", "err": str(e)})
        time.sleep(3)


def _dequeue_ws_job() -> dict | None:
    with _ws_job_lock:
        if _ws_job_queue:
            return _ws_job_queue.pop(0)
    return None


def fetch_next_job() -> dict | None:
    if not state["backend_ok"] or not state["worker_address"]:
        return None
    ws_job = _dequeue_ws_job()
    if ws_job:
        return {"job": {
            "id": ws_job.get("job_id"),
            "model": ws_job.get("model"),
            "messages": ws_job.get("messages", []),
            "sla_tier": ws_job.get("sla_tier", "standard"),
            "confidential": ws_job.get("confidential", False),
            "output_tokens": ws_job.get("max_tokens", 512),
        }}
    resp = _req("GET", f"/v1/jobs/next?worker_address={quote(state['worker_address'], safe='')}")
    if resp and resp.get("job"):
        return resp
    return None


def complete_job_backend(job_id: str, ttft_ms: float, tpot_ms: float, output_tokens: int, response: str = "", confidential: bool = False):
    if not state["backend_ok"]:
        return
    attestation_hash = None
    if confidential and TEE_CAPABLE:
        attestation_hash = compute_job_attestation_hash(job_id, state["worker_address"], response)
    body = {
        "job_id":         job_id,
        "worker_address": state["worker_address"],
        "ttft_ms":        ttft_ms,
        "tpot_ms":        tpot_ms,
        "output_tokens":  output_tokens,
        "response":       response,
    }
    if attestation_hash:
        body["attestation_hash"] = attestation_hash
    if _active_ws:
        try:
            _active_ws.send(json.dumps({
                "type": "job:complete",
                **body,
            }))
            return
        except Exception:
            pass
    _req("POST", "/v1/jobs/complete", body)


def fail_job_backend(job_id: str, error: str):
    if _active_ws:
        try:
            _active_ws.send(json.dumps({
                "type": "job:error",
                "job_id": job_id,
                "error": error,
            }))
        except Exception:
            pass

# ── Heartbeat loop ────────────────────────────────────────────────────────────

def heartbeat_loop():
    while True:
        time.sleep(15 if state["running"] else 30)
        if state["running"]:
            send_heartbeat()

# ── Worker inference loop ─────────────────────────────────────────────────────

PRICE_PER_1M = 8.5


def _update_job_progress(generated: int, max_tokens: int):
    if state["active_job"]:
        pct = min(99.0, (generated / max(max_tokens, 1)) * 100)
        state["active_job"]["progress"] = pct


def worker_loop():
    while state["running"]:
        resp = fetch_next_job()
        job = resp.get("job") if resp else None

        if not job:
            time.sleep(0.5)
            continue

        job_id = job["id"]
        max_tokens = job.get("output_tokens", 512)
        tier = job.get("sla_tier", "standard")
        confidential = job.get("confidential", False) or tier == "confidential"
        inference_messages = prepare_inference_messages(job.get("messages", []))

        state["active_job"] = {
            "id": job_id,
            "tokens": max_tokens,
            "tier": tier,
            "progress": 0.0,
            "turns": len(inference_messages),
        }
        log({"event": "job_start", "id": job_id, "tokens": max_tokens, "tier": tier})

        refresh_gpu()

        try:
            result = inference.run_inference(
                inference_messages,
                max_tokens=max_tokens,
                on_token=lambda n, cap: _update_job_progress(n, cap),
            )
        except Exception as e:
            err = str(e)
            log({"event": "job_error", "id": job_id, "err": err})
            fail_job_backend(job_id, err)
            record = {
                "id": job_id,
                "status": "failed",
                "tokens": 0,
                "tier": tier,
                "earn": 0.0,
                "duration_ms": 0,
                "ts": time.time(),
            }
            state["jobs"].insert(0, record)
            state["jobs"] = state["jobs"][:100]
            state["active_job"] = None
            continue

        if not state["running"]:
            break

        state["active_job"]["progress"] = 100.0
        refresh_gpu()

        tokens = result["tokens"]
        ttft_ms = result["ttft_ms"]
        tpot_ms = result["tpot_ms"]
        response_text = result["content"]
        elapsed_ms = result["duration_ms"]
        earn = round((tokens / 1_000_000) * PRICE_PER_1M, 4)
        tps = round(tokens / max(elapsed_ms / 1000, 0.001), 1)
        state["tokens_per_sec"] = tps

        record = {
            "id": job_id,
            "status": "completed",
            "tokens": tokens,
            "tier": tier,
            "earn": earn,
            "duration_ms": elapsed_ms,
            "ts": time.time(),
        }
        state["jobs"].insert(0, record)
        state["jobs"] = state["jobs"][:100]
        state["active_job"] = None

        state["earnings"]["today"] = round(state["earnings"]["today"] + earn, 4)
        state["earnings"]["week"] = round(state["earnings"]["week"] + earn, 4)
        state["earnings"]["total"] = round(state["earnings"]["total"] + earn, 4)
        state["jobs_today"] += 1

        complete_job_backend(
            job_id, ttft_ms, tpot_ms, tokens,
            response=response_text,
            confidential=confidential,
        )
        log({"event": "job_done", "id": job_id, "status": "completed", "earn": earn, "tps": tps})

        if state["running"]:
            state["tokens_per_sec"] = 0
            refresh_gpu()

# ── Local HTTP API (for Electron UI) ─────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        return json.loads(self.rfile.read(length))

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
                "running":           state["running"],
                "backend_ok":        state["backend_ok"],
                "last_backend_error": state["last_backend_error"],
                "wallet_connected":  bool((state["worker_address"] or "").strip()),
                "inference_ready":   state["inference_ready"],
                "inference_error":   state["inference_error"],
                "inference_backend": state["inference_backend"],
                "worker_address":    state["worker_address"],
                "tee_capable":       TEE_CAPABLE,
                "gpu_detected":      state.get("gpu_detected", False),
                "gpu":               state["gpu"],
                "active_job":        state["active_job"],
                "tokens_per_sec":    state["tokens_per_sec"],
                "jobs_today":        state["jobs_today"],
                "earnings_today":    state["earnings"]["today"],
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
            wallet = (state["worker_address"] or "").strip()
            if len(wallet) < 20:
                self._json({"ok": False, "error": "wallet_required", "message": "Connect your wallet before starting."}, 400)
                return

            refresh_gpu()
            if not state.get("gpu_detected"):
                self._json({
                    "ok": False,
                    "error": "gpu_not_found",
                    "message": (
                        "NVIDIA GPU not detected. Install GeForce drivers, then verify in PowerShell: nvidia-smi"
                    ),
                }, 503)
                return

            if not state["backend_ok"]:
                register_with_backend()
            if not state["backend_ok"]:
                detail = state.get("last_backend_error") or "Cannot reach Gridlock network."
                self._json({
                    "ok": False,
                    "error": "backend_unreachable",
                    "message": detail,
                }, 503)
                return

            try:
                backend = inference.resolve_backend()
                state["inference_ready"] = True
                state["inference_error"] = None
                state["inference_backend"] = backend
                state["tokens_per_sec"] = inference.run_benchmark()
                log({"event": "inference_ready", "backend": backend, "tps": state["tokens_per_sec"]})
            except Exception as e:
                state["inference_ready"] = False
                state["inference_error"] = str(e)
                self._json({"ok": False, "error": "inference_unavailable", "message": str(e)}, 503)
                return

            if not state["running"]:
                state["running"] = True
                set_worker_status("Active")
                send_heartbeat()
                _worker_thread = threading.Thread(target=worker_loop, daemon=True)
                _worker_thread.start()
                threading.Thread(target=ws_loop, daemon=True).start()
            self._json({"ok": True, "backend_ok": state["backend_ok"], "inference_backend": state["inference_backend"]})

        elif self.path == "/worker/stop":
            state["running"]        = False
            state["active_job"]     = None
            state["gpu"]["utilization"] = 0
            state["tokens_per_sec"] = 0
            set_worker_status("Paused")
            send_heartbeat()
            self._json({"ok": True})

        elif self.path == "/wallet":
            body = self._read_json()
            addr = str(body.get("address", "")).strip()
            if len(addr) < 20:
                self._json({"ok": False, "error": "invalid_wallet"}, 400)
                return
            state["worker_address"] = addr
            register_with_backend()
            self._json({
                "ok": True,
                "backend_ok": state["backend_ok"],
                "worker_address": state["worker_address"],
                "message": state["last_backend_error"] if not state["backend_ok"] else None,
            })

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
    parser.add_argument("--tee",     action="store_true", default=TEE_CAPABLE)
    args = parser.parse_args()

    BACKEND_URL              = args.backend.rstrip("/")
    state["worker_address"]  = args.wallet or ""
    TEE_CAPABLE              = args.tee or TEE_CAPABLE

    detect_gpu()
    if state["worker_address"]:
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
