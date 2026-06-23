"""Detect NVIDIA GPU via nvidia-smi (Windows path resolution included)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


def _nvidia_smi_bin() -> str:
    override = os.getenv("GRIDLOCK_NVIDIA_SMI", "").strip()
    if override:
        return override

    found = shutil.which("nvidia-smi")
    if found:
        return found

    if sys.platform == "win32":
        for path in (
            os.path.expandvars(r"%ProgramFiles%\NVIDIA Corporation\NVSMI\nvidia-smi.exe"),
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
            os.path.expandvars(r"%SystemRoot%\System32\nvidia-smi.exe"),
        ):
            if path and os.path.isfile(path):
                return path

    return "nvidia-smi"


def _float(val: str, default: float = 0.0) -> float:
    val = (val or "").strip()
    if not val or val.upper() in ("N/A", "[N/A]"):
        return default
    try:
        return float(val)
    except ValueError:
        return default


def _run_query(fields: str) -> str | None:
    cmd = [
        _nvidia_smi_bin(),
        f"--query-gpu={fields}",
        "--format=csv,noheader,nounits",
    ]
    try:
        out = subprocess.check_output(
            cmd,
            stderr=subprocess.PIPE,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0,
        )
        line = out.decode(errors="replace").strip().splitlines()
        return line[0] if line else None
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def read_gpu_stats() -> dict | None:
    """Return live GPU stats or None if nvidia-smi unavailable."""
    row = _run_query(
        "name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.max_limit"
    )
    if not row:
        return None

    parts = [p.strip() for p in row.split(",")]
    if len(parts) < 7:
        return None

    return {
        "name": parts[0],
        "vram_used_gb": round(_float(parts[1]) / 1024, 1),
        "vram_total_gb": round(_float(parts[2]) / 1024, 1),
        "utilization": int(_float(parts[3])),
        "temperature": int(_float(parts[4])),
        "power_w": round(_float(parts[5])),
        "power_max_w": max(round(_float(parts[6])), 1),
        "detected": True,
    }


def empty_gpu(name: str = "No NVIDIA GPU detected") -> dict:
    return {
        "name": name,
        "vram_used_gb": 0.0,
        "vram_total_gb": 0.0,
        "utilization": 0,
        "temperature": 0,
        "power_w": 0,
        "power_max_w": 0,
        "detected": False,
    }
