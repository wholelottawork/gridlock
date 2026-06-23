"""Local inference via Ollama (preferred) or vLLM OpenAI-compatible API."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Callable

OLLAMA_MODEL = os.getenv("GRIDLOCK_OLLAMA_MODEL", "llama3.1:8b")
VLLM_BASE_URL = os.getenv("GRIDLOCK_VLLM_URL", "http://127.0.0.1:8000/v1").rstrip("/")
VLLM_MODEL = os.getenv("GRIDLOCK_VLLM_MODEL", "meta-llama/Llama-3.1-8B-Instruct")
MAX_OUTPUT_TOKENS = int(os.getenv("GRIDLOCK_MAX_TOKENS", "512"))
INFERENCE_PREF = os.getenv("GRIDLOCK_INFERENCE", "auto")

_ollama_url = (os.getenv("GRIDLOCK_OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")
_active_backend: str | None = None
_active_model: str | None = None


def get_active_model() -> str:
    return _active_model or OLLAMA_MODEL


def _check_ollama(url: str) -> bool:
    try:
        req = urllib.request.Request(f"{url.rstrip('/')}/api/tags")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False


def _check_vllm() -> bool:
    try:
        req = urllib.request.Request(f"{VLLM_BASE_URL}/models")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False


def resolve_backend() -> str:
    global _active_backend, _active_model, _ollama_url

    if INFERENCE_PREF == "vllm":
        if not _check_vllm():
            raise RuntimeError(
                f"vLLM not reachable at {VLLM_BASE_URL}. "
                "Start: vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000"
            )
        _active_backend = "vllm"
        _active_model = VLLM_MODEL
        return _active_backend

    if INFERENCE_PREF == "ollama":
        candidates = [
            os.getenv("GRIDLOCK_OLLAMA_URL", "").rstrip("/"),
            "http://127.0.0.1:11434",
            "http://localhost:11434",
        ]
        for url in [c for c in candidates if c]:
            if _check_ollama(url):
                _ollama_url = url
                _active_backend = "ollama"
                _active_model = OLLAMA_MODEL
                return _active_backend
        raise RuntimeError(
            f"Ollama not running. Install from https://ollama.com/download, "
            f"open the app, then run: ollama pull {OLLAMA_MODEL}"
        )

    # auto — Ollama first, then vLLM
    for url in [
        os.getenv("GRIDLOCK_OLLAMA_URL", "").rstrip("/"),
        "http://127.0.0.1:11434",
        "http://localhost:11434",
    ]:
        if url and _check_ollama(url):
            _ollama_url = url
            _active_backend = "ollama"
            _active_model = OLLAMA_MODEL
            return _active_backend

    if _check_vllm():
        _active_backend = "vllm"
        _active_model = VLLM_MODEL
        return _active_backend

    raise RuntimeError(
        "No inference server found.\n"
        f"  • Ollama (recommended): https://ollama.com/download → ollama pull {OLLAMA_MODEL}\n"
        f"  • vLLM: vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000"
    )


def run_benchmark() -> float:
    result = run_inference([{"role": "user", "content": "Say hi in one word."}], max_tokens=32)
    elapsed = max(result["duration_ms"] / 1000, 0.001)
    return round(result["tokens"] / elapsed, 1)


def run_inference(
    messages: list[dict],
    max_tokens: int = MAX_OUTPUT_TOKENS,
    on_token: Callable[[int, int], None] | None = None,
) -> dict:
    if not _active_backend:
        resolve_backend()
    if _active_backend == "ollama":
        return _run_ollama(messages, max_tokens, on_token)
    return _run_vllm(messages, max_tokens, on_token)


def _run_ollama(
    messages: list[dict],
    max_tokens: int,
    on_token: Callable[[int, int], None] | None,
) -> dict:
    start = time.time()
    first_at: float | None = None
    content = ""
    tokens = 0

    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
        "options": {"num_predict": max_tokens},
    }).encode()

    req = urllib.request.Request(
        f"{_ollama_url}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=300) as resp:
        while True:
            line = resp.readline()
            if not line:
                break
            try:
                chunk = json.loads(line.decode())
            except json.JSONDecodeError:
                continue
            piece = (chunk.get("message") or {}).get("content") or ""
            if not piece:
                continue
            if first_at is None:
                first_at = time.time()
            content += piece
            tokens += 1
            if on_token:
                on_token(tokens, max_tokens)

    end = time.time()
    ttft_ms = int(((first_at or end) - start) * 1000)
    out_tokens = max(tokens, 1)
    tpot_ms = int(((end - (first_at or end)) / max(out_tokens - 1, 1)) * 1000) if out_tokens > 1 else 0

    return {
        "content": content.strip() or "(empty)",
        "tokens": out_tokens,
        "ttft_ms": ttft_ms,
        "tpot_ms": tpot_ms,
        "duration_ms": int((end - start) * 1000),
    }


def _run_vllm(
    messages: list[dict],
    max_tokens: int,
    on_token: Callable[[int, int], None] | None,
) -> dict:
    start = time.time()
    first_at: float | None = None
    content = ""
    tokens = 0

    payload = json.dumps({
        "model": VLLM_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "stream": True,
    }).encode()

    req = urllib.request.Request(
        f"{VLLM_BASE_URL}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=300) as resp:
        while True:
            line = resp.readline()
            if not line:
                break
            text = line.decode().strip()
            if not text.startswith("data:"):
                continue
            raw = text[5:].strip()
            if raw == "[DONE]":
                break
            try:
                chunk = json.loads(raw)
            except json.JSONDecodeError:
                continue
            piece = (chunk.get("choices") or [{}])[0].get("delta", {}).get("content") or ""
            if not piece:
                continue
            if first_at is None:
                first_at = time.time()
            content += piece
            tokens += 1
            if on_token:
                on_token(tokens, max_tokens)

    end = time.time()
    ttft_ms = int(((first_at or end) - start) * 1000)
    out_tokens = max(tokens, 1)
    tpot_ms = int(((end - (first_at or end)) / max(out_tokens - 1, 1)) * 1000) if out_tokens > 1 else 0

    return {
        "content": content.strip() or "(empty)",
        "tokens": out_tokens,
        "ttft_ms": ttft_ms,
        "tpot_ms": tpot_ms,
        "duration_ms": int((end - start) * 1000),
    }
