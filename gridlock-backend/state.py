"""
In-memory state store.
All access must hold state.lock to avoid races.
"""
import threading
import time
from collections import deque


class State:
    def __init__(self):
        self.lock = threading.Lock()

        # worker_address -> dict
        self.workers: dict[str, dict] = {}

        # job_id -> dict
        self.jobs: dict[str, dict] = {}

        # live SSE events (capped)
        self.events: deque = deque(maxlen=2000)

        # mock Solana slot that ticks every background cycle
        self.solana_slot: int = 280_000_000

        self._job_counter = 0

    # ── helpers ──────────────────────────────────────────────────────────────

    def next_job_id(self) -> str:
        with self.lock:
            self._job_counter += 1
            return f"job_{self._job_counter:08x}"

    def emit(self, event: dict):
        """Append an event to the live stream buffer."""
        with self.lock:
            self.events.append(event)

    def active_workers(self) -> list[dict]:
        with self.lock:
            return [w for w in self.workers.values() if w["status"] == "active"]

    def pick_worker(self, *, tee_required: bool = False) -> dict | None:
        """Return the best available worker, or None."""
        with self.lock:
            pool = [w for w in self.workers.values() if w["status"] == "active"]
            if tee_required:
                pool = [w for w in pool if w.get("tee_capable")]
            if not pool:
                return None
            # highest goodput_score wins
            return max(pool, key=lambda w: w.get("goodput_score", 0))


state = State()
