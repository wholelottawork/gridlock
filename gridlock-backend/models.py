from pydantic import BaseModel
from typing import Optional, List


# ── Worker ────────────────────────────────────────────────────────────────────

class RegisterWorkerBody(BaseModel):
    operator_pubkey: str
    role: str                       # Prefill | Decode | Cache | Router
    hardware_tier: str              # RTX 4090 | A100 | H100 | etc.
    tee_capable: bool
    endpoint: Optional[str] = ""
    staked_lock: Optional[float] = 0.0


class HeartbeatBody(BaseModel):
    worker_address: str
    goodput_score: Optional[float] = None
    jobs_completed: Optional[int] = 0
    earnings: Optional[float] = 0.0


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class GridlockParams(BaseModel):
    sla: Optional[str] = "standard"
    privacy: Optional[bool] = False


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    gridlock: Optional[GridlockParams] = None


# ── Jobs ──────────────────────────────────────────────────────────────────────

class CompleteJobBody(BaseModel):
    job_id: str
    worker_address: str
    ttft_ms: float
    tpot_ms: float
    output_tokens: int
    attestation_hash: Optional[str] = None
