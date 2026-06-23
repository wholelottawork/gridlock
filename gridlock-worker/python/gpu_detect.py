"""Backward-compatible GPU helpers — delegates to hardware_detect."""

from __future__ import annotations

from hardware_detect import (
    _nvidia_smi_bin,
    detect_all_gpus,
    empty_gpu,
    select_gpu,
)

__all__ = ["read_gpu_stats", "empty_gpu", "_nvidia_smi_bin"]


def read_gpu_stats() -> dict | None:
    """Return live stats for the first NVIDIA GPU, else first detected GPU."""
    gpus = detect_all_gpus()
    if not gpus:
        return None
    gpu = select_gpu(gpus, gpus[0]["index"])
    if not gpu or not gpu.get("stats_available"):
        return gpu
    return gpu
