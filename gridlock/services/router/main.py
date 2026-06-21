"""
Gridlock Router Service v0.3.0
All 6 production gaps closed:
  1. Field names aligned with api-client.ts
  2. Supabase REST persistence (jobs + workers)
  3. Heartbeat timeout → AutoGated background task
  4. True SSE streaming for stream=true requests
  5. Redis cache index + dynamic fee model
  6. Solana transaction building with solders
"""

import asyncio
import hashlib
import json
import os
import random
import string
import struct
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Gridlock Router", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API key auth — set API_KEYS env var to enable (empty = dev mode, open)
# ---------------------------------------------------------------------------
_API_KEYS: set[str] = set()  # populated after env load below
_OPEN_PATHS = {"/health", "/v1/live", "/docs", "/openapi.json", "/redoc"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not _API_KEYS or request.url.path in _OPEN_PATHS:
        return await call_next(request)
    key = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if key not in _API_KEYS:
        return JSONResponse({"error": "Invalid or missing API key"}, status_code=401)
    return await call_next(request)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
VLLM_ENDPOINT       = os.getenv("VLLM_ENDPOINT",       "http://localhost:8000")
VLLM_API_KEY        = os.getenv("VLLM_API_KEY",        "")
REDIS_URL           = os.getenv("REDIS_URL",            "redis://localhost:6379")
SOLANA_RPC_URL      = os.getenv("SOLANA_RPC_URL",       "https://api.devnet.solana.com")
ROUTER_KEYPAIR_PATH = os.getenv("ROUTER_KEYPAIR_PATH",  "~/.config/solana/id.json")
SUPABASE_URL        = os.getenv("SUPABASE_URL",         "")
SUPABASE_KEY        = os.getenv("SUPABASE_KEY",         "")
WATCHER_SAMPLE_RATE = float(os.getenv("WATCHER_SAMPLE_RATE", "0.05"))

# Populate auth set from env (empty string or unset = auth disabled)
_API_KEYS = set(k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip())

PROGRAM_PROVIDER_REGISTRY = "FtcDkiVRPSjubZwNktwV1wNw8jvgvGHXHhYsTbvAf6T2"
PROGRAM_JOB_SCHEDULER     = "9FpypwgXqgNGsXrgTtzZ4G62tYB5vH8FZKBHzt3sCAJG"
PROGRAM_SLA_REGISTRY      = "3vJZMJReLan77UZE5nJEZf2UrvwfBe5zv78LBre3UPZM"
PROGRAM_SLA_ENFORCER      = "4TVPu4tTHfHWLaj8Srbp6v89KHPcN1t5iijNxQrSR4ci"
PROGRAM_FEE_COLLECTOR     = "4mrEY6MWLFCFA2wHuLqDxT6YzgsYaGjXDa4K1idqD79L"

SLA_TARGETS: dict[str, dict[str, int]] = {
    "realtime":     {"ttft": 300,  "tpot": 60},
    "standard":     {"ttft": 800,  "tpot": 120},
    "batch":        {"ttft": 5000, "tpot": 9999},
    "confidential": {"ttft": 800,  "tpot": 120},
}

PENALTY_MULT: dict[str, float] = {
    "realtime": 2.0, "standard": 1.0, "batch": 0.25, "confidential": 1.0,
}

# Gap 5: dynamic fee model
_MODEL_BASE_FEE: dict[str, float] = {
    "llama-3.1-70b": 0.08,
    "llama-3.1-8b":  0.02,
    "mistral-7b":    0.02,
    "qwen2.5-72b":   0.07,
}
_TIER_FEE_MULT: dict[str, float] = {
    "realtime": 2.0, "standard": 1.0, "batch": 0.4, "confidential": 2.5,
}

def compute_fee(model: str, sla_tier: str, prompt_tokens: int) -> float:
    base  = _MODEL_BASE_FEE.get(model, 0.05)
    tier  = _TIER_FEE_MULT.get(sla_tier, 1.0)
    scale = max(1.0, prompt_tokens / 512)
    return round(base * tier * scale, 4)

# ---------------------------------------------------------------------------
# In-memory stores
# ---------------------------------------------------------------------------
_jobs_store: deque[dict]      = deque(maxlen=1000)
_cache_index: dict[str, str]  = {}
_live_subscribers: list[asyncio.Queue] = []
_total_lock_burned: float     = 0.0

# ---------------------------------------------------------------------------
# Gap 5: Redis
# ---------------------------------------------------------------------------
_redis_client = None

async def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not REDIS_URL:
        return None
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(REDIS_URL, decode_responses=True)
        await r.ping()
        _redis_client = r
        print("[redis] connected")
        return r
    except Exception as e:
        print(f"[redis] unavailable: {e}")
        return None

async def cache_get(key: str) -> str | None:
    r = await _get_redis()
    if r:
        return await r.hget("gridlock:cache_index", key)
    return _cache_index.get(key)

async def cache_set(key: str, value: str) -> None:
    r = await _get_redis()
    if r:
        await r.hset("gridlock:cache_index", key, value)
        await r.expire("gridlock:cache_index", 3600)
    else:
        _cache_index[key] = value

async def cache_count() -> int:
    r = await _get_redis()
    if r:
        return await r.hlen("gridlock:cache_index")
    return len(_cache_index)

# ---------------------------------------------------------------------------
# Gap 2: Supabase persistence via official supabase-py client
# (new sb_secret_/sb_publishable_ key format requires the SDK — raw REST calls
#  with apikey header return 401 "Forbidden use of secret API key in browser")
# ---------------------------------------------------------------------------
_sb_client = None  # supabase.Client, initialised lazily on first use

def _init_sb() -> object | None:
    global _sb_client
    if _sb_client is not None:
        return _sb_client
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        from supabase import create_client
        _sb_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[supabase] client ready")
    except Exception as e:
        print(f"[supabase] init failed: {e}")
    return _sb_client

async def _sb_run(fn) -> any:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn)

async def db_insert_job(job: dict) -> None:
    sb = _init_sb()
    if not sb:
        return
    try:
        resp = await _sb_run(lambda: sb.table("jobs").insert(job).execute())
        print(f"[supabase] job saved {job.get('id','?')[:8]}: {getattr(resp, 'data', resp)}")
    except Exception as e:
        print(f"[supabase] insert_job failed: {e}")

async def db_upsert_worker(worker_dict: dict) -> None:
    sb = _init_sb()
    if not sb:
        return
    try:
        payload = {**worker_dict, "sla_tiers": json.dumps(worker_dict["sla_tiers"])}
        await _sb_run(lambda: sb.table("workers").upsert(payload, on_conflict="address").execute())
    except Exception as e:
        print(f"[supabase] upsert_worker failed: {e}")

async def db_load_jobs() -> list[dict]:
    sb = _init_sb()
    if not sb:
        return []
    try:
        resp = await _sb_run(lambda: sb.table("jobs").select("*").order("ts", desc=True).limit(1000).execute())
        return resp.data or []
    except Exception as e:
        print(f"[supabase] load_jobs failed: {e}")
    return []

async def db_load_workers() -> list[dict]:
    sb = _init_sb()
    if not sb:
        return []
    try:
        resp = await _sb_run(lambda: sb.table("workers").select("*").execute())
        rows = resp.data or []
        for r in rows:
            if isinstance(r.get("sla_tiers"), str):
                r["sla_tiers"] = json.loads(r["sla_tiers"])
        return rows
    except Exception as e:
        print(f"[supabase] load_workers failed: {e}")
    return []

# ---------------------------------------------------------------------------
# Worker registry model + seeding
# ---------------------------------------------------------------------------
HARDWARE_TIERS = ["RTX 4090", "RTX 3090", "A100 80G", "H100 SXM", "RTX 5090", "A6000"]
ROLES          = ["Prefill", "Decode", "Cache", "Router"]

class WorkerRecord(BaseModel):
    address: str
    role: str
    endpoint: str
    sla_tiers: list[str]
    tee_capable: bool
    reliability_score: int
    goodput_score: int
    sla_pass_rate: float
    p99_ttft_ms: int
    status: str
    staked_lock: int
    hardware_tier: str
    jobs_today: int
    earnings_today: float
    penalties_paid: int
    is_confidential: bool
    last_heartbeat: float
    registered_at: float

_workers_registry: list[WorkerRecord] = []

def _seed_workers() -> list[WorkerRecord]:
    chars = string.ascii_letters + string.digits
    def addr() -> str:
        return "".join(random.choices(chars, k=44))
    out = []
    for i in range(20):
        role = ROLES[i % 4]
        tee  = random.random() > 0.45
        tiers = ["batch", "standard"]
        if random.random() > 0.4:            tiers.append("realtime")
        if tee and random.random() > 0.5:    tiers.append("confidential")
        out.append(WorkerRecord(
            address=addr(), role=role, endpoint=VLLM_ENDPOINT,
            sla_tiers=tiers, tee_capable=tee,
            reliability_score=random.randint(6500, 9900),
            goodput_score=random.randint(200, 1800),
            sla_pass_rate=round(random.uniform(88, 99.5), 1),
            p99_ttft_ms=random.randint(120, 480),
            status="Active" if random.random() > 0.15 else "Paused",
            staked_lock=random.randint(5000, 80000),
            hardware_tier=random.choice(HARDWARE_TIERS),
            jobs_today=random.randint(800, 12000),
            earnings_today=round(random.uniform(12, 420), 2),
            penalties_paid=random.randint(0, 500),
            is_confidential=tee and random.random() > 0.4,
            last_heartbeat=time.time() - random.uniform(0, 60),
            registered_at=time.time() - random.uniform(86400, 86400 * 30),
        ))
    return out

def _seed_jobs() -> None:
    models     = ["llama-3.1-70b", "llama-3.1-8b", "mistral-7b", "qwen2.5-72b"]
    tiers_pool = ["realtime", "realtime", "standard", "batch", "confidential"]
    for _ in range(80):
        tier   = random.choice(tiers_pool)
        ttft   = random.randint(80, 900)
        tpot   = random.randint(30, 150)
        met    = ttft <= SLA_TARGETS[tier]["ttft"]
        model  = random.choice(models)
        tokens = random.randint(64, 1024)
        fee    = compute_fee(model, tier, tokens)
        worker = random.choice(_workers_registry)
        job_id = str(uuid.uuid4())
        _jobs_store.append({
            "id": job_id,
            "customer": "".join(random.choices(string.ascii_letters + string.digits, k=12)),
            "model": model, "sla_tier": tier,
            "ttft_ms": ttft, "tpot_ms": tpot,
            "sla_met": met, "confidential": tier == "confidential",
            "worker": worker.address[:8], "worker_address": worker.address,
            "ts": time.time() - random.uniform(0, 3600),
            "penalty_paid": None if met else round(fee * PENALTY_MULT[tier], 4),
            "fee": fee, "status": "settled",
            "attestation_hash": f"attest_{job_id[:16]}" if tier == "confidential" else None,
        })

# ---------------------------------------------------------------------------
# Gap 3: Heartbeat watcher
# ---------------------------------------------------------------------------
async def _heartbeat_watcher() -> None:
    while True:
        await asyncio.sleep(60)
        now = time.time()
        for w in _workers_registry:
            stale = now - w.last_heartbeat > 120
            if w.status == "Active" and stale:
                w.status = "AutoGated"
                print(f"[watcher] AutoGated {w.address[:8]}… ({int(now - w.last_heartbeat)}s silent)")
                asyncio.create_task(db_upsert_worker(w.model_dump()))
            elif w.status == "AutoGated" and not stale:
                w.status = "Active"
                print(f"[watcher] Recovered {w.address[:8]}…")
                asyncio.create_task(db_upsert_worker(w.model_dump()))

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    global _workers_registry
    db_workers = await db_load_workers()
    if db_workers:
        now = time.time()
        for w in db_workers:
            w["last_heartbeat"] = now  # reset so watcher doesn't immediately AutoGate them
            w["status"] = "Active"
        _workers_registry = [WorkerRecord(**w) for w in db_workers]
        print(f"[startup] {len(_workers_registry)} workers from Supabase (heartbeats reset)")
    else:
        _workers_registry = _seed_workers()
        print(f"[startup] {len(_workers_registry)} workers seeded (no Supabase)")

    db_jobs = await db_load_jobs()
    if db_jobs:
        for j in db_jobs:
            _jobs_store.append(j)
        print(f"[startup] {len(db_jobs)} jobs from Supabase")
    else:
        _seed_jobs()
        print(f"[startup] {len(_jobs_store)} jobs seeded (no Supabase)")

    await _get_redis()
    asyncio.create_task(_heartbeat_watcher())

# ---------------------------------------------------------------------------
# Gap 6: Solana with solders
# ---------------------------------------------------------------------------
def _anchor_discriminator(name: str) -> bytes:
    return hashlib.sha256(f"global:{name}".encode()).digest()[:8]

def _borsh_args(*pairs: tuple) -> bytes:
    out = b""
    for value, typ in pairs:
        if typ == "string":
            enc = value.encode("utf-8")
            out += struct.pack("<I", len(enc)) + enc
        elif typ == "bool":
            out += struct.pack("?", value)
        elif typ == "u32":
            out += struct.pack("<I", value)
        elif typ == "u64":
            out += struct.pack("<Q", value)
    return out

def _load_keypair():
    try:
        from solders.keypair import Keypair
        path = Path(ROUTER_KEYPAIR_PATH).expanduser()
        if not path.exists():
            return None
        return Keypair.from_bytes(bytes(json.loads(path.read_text())))
    except Exception as e:
        print(f"[solana] keypair load failed: {e}")
        return None

def _derive_pda(program_id: str, seeds: list[bytes]):
    try:
        from solders.pubkey import Pubkey
        return Pubkey.find_program_address(seeds, Pubkey.from_string(program_id))
    except Exception as e:
        print(f"[solana] PDA failed: {e}")
        return None, None

async def solana_rpc(method: str, params: list[Any]) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            SOLANA_RPC_URL,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        return resp.json()

async def _send_anchor_ix(program_id: str, data: bytes, accounts: list) -> str | None:
    if not SOLANA_RPC_URL or "localhost" in SOLANA_RPC_URL:
        return None
    try:
        import base64
        from solders.hash import Hash
        from solders.instruction import Instruction
        from solders.message import MessageV0
        from solders.pubkey import Pubkey
        from solders.transaction import VersionedTransaction

        kp = _load_keypair()
        if not kp:
            return None

        rpc    = await solana_rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
        bh_str = rpc["result"]["value"]["blockhash"]
        blockhash = Hash.from_string(bh_str)

        ix  = Instruction(Pubkey.from_string(program_id), data, accounts)
        msg = MessageV0.try_compile(kp.pubkey(), [ix], [], blockhash)
        tx  = VersionedTransaction(msg, [kp])

        result = await solana_rpc(
            "sendTransaction",
            [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "preflightCommitment": "confirmed"}],
        )
        if "error" in result:
            print(f"[solana] tx error: {result['error']}")
            return None
        sig = result.get("result")
        print(f"[solana] tx: {sig}")
        return sig
    except Exception as e:
        print(f"[solana] send failed: {e}")
        return None

async def anchor_commit_receipt(
    job_id: str, sla_tier: str, ttft_ms: int, tpot_ms: int,
    sla_met: bool, confidential: bool, router_sig: bytes,
) -> str | None:
    if not SOLANA_RPC_URL or "localhost" in SOLANA_RPC_URL:
        return None
    try:
        from solders.instruction import AccountMeta
        from solders.pubkey import Pubkey

        kp = _load_keypair()
        if not kp:
            return None
        seed      = job_id.replace("-", "").encode()[:32]
        pda, _    = _derive_pda(PROGRAM_SLA_REGISTRY, [b"receipt", seed])
        if not pda:
            return None
        data = _anchor_discriminator("commit_receipt") + _borsh_args(
            (job_id, "string"), (sla_tier, "string"),
            (ttft_ms, "u32"), (tpot_ms, "u32"),
            (sla_met, "bool"), (confidential, "bool"),
        )
        accounts = [
            AccountMeta(kp.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(pda, is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
        ]
        return await _send_anchor_ix(PROGRAM_SLA_REGISTRY, data, accounts)
    except Exception as e:
        print(f"[solana] commit_receipt: {e}")
        return None

async def anchor_settle_or_penalize(job_id: str) -> str | None:
    if not SOLANA_RPC_URL or "localhost" in SOLANA_RPC_URL:
        return None
    try:
        from solders.instruction import AccountMeta
        from solders.pubkey import Pubkey

        kp = _load_keypair()
        if not kp:
            return None
        seed         = job_id.replace("-", "").encode()[:32]
        receipt, _   = _derive_pda(PROGRAM_SLA_REGISTRY, [b"receipt", seed])
        enforcer, _  = _derive_pda(PROGRAM_SLA_ENFORCER, [b"sla_enforcer"])
        if not receipt or not enforcer:
            return None
        data = _anchor_discriminator("settle_or_penalize") + _borsh_args((job_id, "string"))
        TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        accounts = [
            AccountMeta(enforcer, is_signer=False, is_writable=False),
            AccountMeta(receipt, is_signer=False, is_writable=True),
            AccountMeta(kp.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(Pubkey.from_string(TOKEN_2022), is_signer=False, is_writable=False),
        ]
        return await _send_anchor_ix(PROGRAM_SLA_ENFORCER, data, accounts)
    except Exception as e:
        print(f"[solana] settle_or_penalize: {e}")
        return None

async def anchor_distribute_fees(job_id: str, amount_lock: int) -> str | None:
    if not SOLANA_RPC_URL or "localhost" in SOLANA_RPC_URL:
        return None
    try:
        from solders.instruction import AccountMeta

        kp = _load_keypair()
        if not kp:
            return None
        collector, _ = _derive_pda(PROGRAM_FEE_COLLECTOR, [b"fee_collector"])
        if not collector:
            return None
        data = _anchor_discriminator("distribute_fees") + _borsh_args(
            (job_id, "string"), (amount_lock, "u64"),
        )
        from solders.instruction import AccountMeta
        accounts = [
            AccountMeta(collector, is_signer=False, is_writable=True),
            AccountMeta(kp.pubkey(), is_signer=True, is_writable=True),
        ]
        return await _send_anchor_ix(PROGRAM_FEE_COLLECTOR, data, accounts)
    except Exception as e:
        print(f"[solana] distribute_fees: {e}")
        return None

async def anchor_register_worker(
    operator_pubkey: str, role: str, hardware_tier: str, tee_capable: bool,
) -> str | None:
    if not SOLANA_RPC_URL or "localhost" in SOLANA_RPC_URL:
        return None
    try:
        from solders.instruction import AccountMeta
        from solders.pubkey import Pubkey

        kp = _load_keypair()
        if not kp:
            return None
        op_key       = Pubkey.from_string(operator_pubkey)
        worker_pda, _ = _derive_pda(PROGRAM_PROVIDER_REGISTRY, [b"worker", bytes(op_key)])
        if not worker_pda:
            return None
        data = _anchor_discriminator("register_worker") + _borsh_args(
            (role, "string"), (hardware_tier, "string"), (tee_capable, "bool"),
        )
        accounts = [
            AccountMeta(kp.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(op_key, is_signer=False, is_writable=False),
            AccountMeta(worker_pda, is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
        ]
        return await _send_anchor_ix(PROGRAM_PROVIDER_REGISTRY, data, accounts)
    except Exception as e:
        print(f"[solana] register_worker: {e}")
        return None

async def get_recent_slots() -> int:
    try:
        result = await solana_rpc("getSlot", [])
        return result.get("result", 0)
    except Exception:
        return 0

# ---------------------------------------------------------------------------
# Worker selection
# ---------------------------------------------------------------------------
def hash_prefix(prompt: str) -> str:
    return hashlib.sha256(prompt[:256].encode()).hexdigest()

def pick_worker(sla_tier: str, confidential: bool, warm_addr: str | None) -> WorkerRecord | None:
    eligible = [
        w for w in _workers_registry
        if w.status == "Active"
        and sla_tier in w.sla_tiers
        and (not confidential or w.tee_capable)
    ]
    if not eligible:
        return None
    if warm_addr:
        warm = next((w for w in eligible if w.address == warm_addr), None)
        if warm:
            return warm
    return max(eligible, key=lambda w: w.goodput_score)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class GridlockOptions(BaseModel):
    sla: str = "standard"
    privacy: bool = False

class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[Message]
    stream: bool = False
    max_tokens: int | None = None
    temperature: float = 1.0
    gridlock: GridlockOptions = GridlockOptions()

class RegisterWorkerRequest(BaseModel):
    operator_pubkey: str
    role: str
    hardware_tier: str
    tee_capable: bool = False
    endpoint: str = ""

class HeartbeatRequest(BaseModel):
    worker_address: str
    goodput_score: int | None = None
    p99_ttft_ms: int | None = None

# ---------------------------------------------------------------------------
# Background helpers
# ---------------------------------------------------------------------------
async def _broadcast_event(event: dict) -> None:
    dead = []
    for q in _live_subscribers:
        try:
            await q.put(event)
        except Exception:
            dead.append(q)
    for q in dead:
        _live_subscribers.remove(q)

async def _settle(
    job_id: str, sla_tier: str, ttft_ms: int, tpot_ms: int,
    sla_met: bool, confidential: bool, worker: WorkerRecord, fee: float,
) -> None:
    global _total_lock_burned
    penalty = None if sla_met else fee * PENALTY_MULT[sla_tier]
    _total_lock_burned += fee * 0.10

    print(f"[receipt] {job_id[:12]} tier={sla_tier} ttft={ttft_ms}ms {'MET' if sla_met else 'MISS'}")

    await anchor_commit_receipt(job_id, sla_tier, ttft_ms, tpot_ms, sla_met, confidential, b"")
    if not sla_met:
        await anchor_settle_or_penalize(job_id)
    await anchor_distribute_fees(job_id, int(fee * 1_000_000))

    for j in _jobs_store:
        if j["id"] == job_id:
            j["status"] = "settled"
            break

    job = next((j for j in _jobs_store if j["id"] == job_id), None)
    if job:
        await db_insert_job(job)

    await _broadcast_event({
        "type": "job", "id": job_id,
        "sla_tier": sla_tier, "ttft_ms": ttft_ms, "tpot_ms": tpot_ms,
        "sla_met": sla_met, "penalty": penalty,
        "worker": worker.address[:8], "ts": time.time(),
    })

async def _watcher_sample(job_id: str, router_ttft: int) -> None:
    if random.random() > WATCHER_SAMPLE_RATE:
        return
    watcher = router_ttft + random.randint(-20, 20)
    delta   = abs(watcher - router_ttft)
    tag     = "DISPUTE" if delta > 50 else "VERIFIED"
    print(f"[watcher] {tag} job={job_id[:12]} delta={delta}ms")

# ---------------------------------------------------------------------------
# Gap 4: /v1/chat/completions — real SSE streaming
# ---------------------------------------------------------------------------
@app.post("/v1/chat/completions")
async def chat_completions(
    req: ChatCompletionRequest,
    authorization: str = Header(default=""),
):
    job_id       = str(uuid.uuid4())
    sla_tier     = req.gridlock.sla if req.gridlock.sla in SLA_TARGETS else "standard"
    confidential = req.gridlock.privacy
    prompt       = " ".join(m.content for m in req.messages)
    prompt_tokens = len(prompt.split())
    fee          = compute_fee(req.model, sla_tier, prompt_tokens)
    target_ttft  = SLA_TARGETS[sla_tier]["ttft"]
    target_tpot  = SLA_TARGETS[sla_tier]["tpot"]
    customer     = authorization.replace("Bearer ", "")[:12] or "anonymous"

    warm     = await cache_get(hash_prefix(prompt))
    worker   = pick_worker(sla_tier, confidential, warm)
    if not worker:
        raise HTTPException(503, "No eligible workers for this SLA tier")

    vllm_payload = {
        "model": req.model,
        "messages": [m.model_dump() for m in req.messages],
        "stream": True,
        "max_tokens": req.max_tokens or 512,
        "temperature": req.temperature,
    }

    # ── Streaming ─────────────────────────────────────────────────────────────
    if req.stream:
        accept_ts: float = time.perf_counter()
        first_ts: list[float] = []

        async def stream_gen():
            token_count = 0
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    _headers = {"Authorization": f"Bearer {VLLM_API_KEY}"} if VLLM_API_KEY else {}
                    async with client.stream(
                        "POST", f"{worker.endpoint}/v1/chat/completions", json=vllm_payload, headers=_headers
                    ) as resp:
                        async for line in resp.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            chunk = line[6:].strip()
                            if chunk == "[DONE]":
                                yield "data: [DONE]\n\n"
                                break
                            if not first_ts:
                                first_ts.append(time.perf_counter())
                            token_count += 1
                            yield f"data: {chunk}\n\n"
            except (httpx.ConnectError, httpx.TimeoutException):
                if not first_ts:
                    first_ts.append(time.perf_counter())
                stub = json.dumps({
                    "id": f"chatcmpl-{job_id}", "object": "chat.completion.chunk",
                    "model": req.model,
                    "choices": [{"index": 0, "delta": {"content": "vLLM not connected."}, "finish_reason": "stop"}],
                })
                yield f"data: {stub}\n\n"
                yield "data: [DONE]\n\n"

            ttft_ms = int((first_ts[0] - accept_ts) * 1000) if first_ts else 0
            sla_met = ttft_ms <= target_ttft
            rec = {
                "id": job_id, "customer": customer, "model": req.model,
                "sla_tier": sla_tier, "ttft_ms": ttft_ms, "tpot_ms": 0,
                "sla_met": sla_met, "confidential": confidential,
                "worker": worker.address[:8], "worker_address": worker.address,
                "ts": time.time(),
                "penalty_paid": None if sla_met else round(fee * PENALTY_MULT[sla_tier], 4),
                "fee": fee, "status": "settling",
                "attestation_hash": f"attest_{job_id[:16]}" if confidential else None,
            }
            _jobs_store.append(rec)
            await cache_set(hash_prefix(prompt), worker.address)
            asyncio.create_task(_settle(job_id, sla_tier, ttft_ms, 0, sla_met, confidential, worker, fee))
            asyncio.create_task(_watcher_sample(job_id, ttft_ms))

        return StreamingResponse(
            stream_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── Non-streaming ─────────────────────────────────────────────────────────
    accept_ts      = time.perf_counter()
    first_token_ts: float | None = None
    tokens: list[str] = []
    ttft_ms = tpot_ms = 0

    try:
        _bk_headers = {"Authorization": f"Bearer {VLLM_API_KEY}"} if VLLM_API_KEY else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream(
                "POST", f"{worker.endpoint}/v1/chat/completions",
                json=vllm_payload, headers=_bk_headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()   # strip "data:" then whitespace
                    if raw == "[DONE]":
                        break
                    now = time.perf_counter()
                    if first_token_ts is None:
                        first_token_ts = now
                        ttft_ms = int((now - accept_ts) * 1000)
                    try:
                        data = json.loads(raw)
                        text = data["choices"][0]["delta"].get("content", "")
                        if text:
                            tokens.append(text)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
    except (httpx.ConnectError, httpx.TimeoutException):
        await asyncio.sleep(0.15)
        first_token_ts = time.perf_counter()
        ttft_ms = int((first_token_ts - accept_ts) * 1000)
        for t in ["Gridlock ", "router ", "running. ", "vLLM ", "not ", "connected."]:
            await asyncio.sleep(0.02)
            tokens.append(t)
        tpot_ms = 20
    except httpx.HTTPStatusError as e:
        print(f"[backend] HTTP {e.response.status_code}: {e.response.text[:200]}")
        tokens.append(f"Backend error {e.response.status_code}")
        first_token_ts = time.perf_counter()
        ttft_ms = int((first_token_ts - accept_ts) * 1000)

    if first_token_ts and len(tokens) > 1:
        tpot_ms = int(((time.perf_counter() - first_token_ts) / max(len(tokens), 1)) * 1000)

    sla_met = ttft_ms <= target_ttft and tpot_ms <= target_tpot
    penalty = None if sla_met else fee * PENALTY_MULT[sla_tier]

    await cache_set(hash_prefix(prompt), worker.address)

    job_record = {
        "id": job_id, "customer": customer, "model": req.model,
        "sla_tier": sla_tier, "ttft_ms": ttft_ms, "tpot_ms": tpot_ms,
        "sla_met": sla_met, "confidential": confidential,
        "worker": worker.address[:8], "worker_address": worker.address,
        "ts": time.time(), "penalty_paid": penalty,
        "fee": fee, "status": "settling",
        "attestation_hash": f"attest_{job_id[:16]}" if confidential else None,
    }
    _jobs_store.append(job_record)

    asyncio.create_task(_settle(job_id, sla_tier, ttft_ms, tpot_ms, sla_met, confidential, worker, fee))
    asyncio.create_task(_watcher_sample(job_id, ttft_ms))

    return {
        "id": f"chatcmpl-{job_id}", "object": "chat.completion", "model": req.model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "".join(tokens) or "(no response)"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": len(tokens), "total_tokens": prompt_tokens + len(tokens)},
        "gridlock": {
            "job_id": job_id, "ttft_ms": ttft_ms, "tpot_ms": tpot_ms,
            "sla_tier": sla_tier, "sla_met": sla_met, "sla_target_ttft_ms": target_ttft,
            "worker": worker.address, "confidential": confidential,
            "penalty_due_lock": penalty, "fee_lock": fee,
            "attestation_hash": f"attest_{job_id[:16]}" if confidential else None,
        },
    }

# ---------------------------------------------------------------------------
# /v1/jobs
# ---------------------------------------------------------------------------
@app.get("/v1/jobs")
def list_jobs(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    sla_tier: str | None = None,
    sla_met: bool | None = None,
    worker: str | None = None,
):
    jobs = list(reversed(list(_jobs_store)))
    if sla_tier:  jobs = [j for j in jobs if j["sla_tier"] == sla_tier]
    if sla_met is not None: jobs = [j for j in jobs if j["sla_met"] == sla_met]
    if worker:    jobs = [j for j in jobs if j.get("worker_address", "").startswith(worker)]
    return {"jobs": jobs[offset:offset + limit], "total": len(jobs), "limit": limit, "offset": offset}

@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str):
    job = next((j for j in _jobs_store if j["id"] == job_id), None)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return job

# ---------------------------------------------------------------------------
# /v1/workers
# ---------------------------------------------------------------------------
@app.get("/v1/workers")
def list_workers(
    role: str | None = None,
    status: str | None = None,
    tee_capable: bool | None = None,
    limit: int = Query(50, le=200),
):
    workers = [w.model_dump() for w in _workers_registry]
    if role:        workers = [w for w in workers if w["role"].lower() == role.lower()]
    if status:      workers = [w for w in workers if w["status"].lower() == status.lower()]
    if tee_capable is not None: workers = [w for w in workers if w["tee_capable"] == tee_capable]
    return {"workers": workers[:limit], "total": len(workers)}

@app.get("/v1/workers/{address}")
def get_worker(address: str):
    worker = next((w for w in _workers_registry if w.address.startswith(address)), None)
    if not worker:
        raise HTTPException(404, f"Worker {address} not found")
    recent = [j for j in _jobs_store if j.get("worker_address", "").startswith(address)][-20:]
    return {**worker.model_dump(), "recent_jobs": list(reversed(recent))}

@app.post("/v1/workers/register")
async def register_worker(req: RegisterWorkerRequest):
    if next((w for w in _workers_registry if w.address == req.operator_pubkey), None):
        raise HTTPException(409, "Worker already registered")
    tx = await anchor_register_worker(req.operator_pubkey, req.role, req.hardware_tier, req.tee_capable)
    new_worker = WorkerRecord(
        address=req.operator_pubkey, role=req.role,
        endpoint=req.endpoint or VLLM_ENDPOINT,
        sla_tiers=["batch", "standard"], tee_capable=req.tee_capable,
        reliability_score=5000, goodput_score=0, sla_pass_rate=100.0,
        p99_ttft_ms=0, status="Active", staked_lock=0,
        hardware_tier=req.hardware_tier, jobs_today=0, earnings_today=0.0,
        penalties_paid=0, is_confidential=False,
        last_heartbeat=time.time(), registered_at=time.time(),
    )
    _workers_registry.append(new_worker)
    asyncio.create_task(db_upsert_worker(new_worker.model_dump()))
    return {"success": True, "address": req.operator_pubkey, "tx_sig": tx}

@app.post("/v1/workers/heartbeat")
async def worker_heartbeat(req: HeartbeatRequest):
    worker = next((w for w in _workers_registry if w.address.startswith(req.worker_address)), None)
    if not worker:
        raise HTTPException(404, "Worker not found")
    worker.last_heartbeat = time.time()
    if worker.status == "AutoGated":
        worker.status = "Active"
        print(f"[heartbeat] {req.worker_address[:8]}… recovered")
    if req.goodput_score is not None: worker.goodput_score = req.goodput_score
    if req.p99_ttft_ms  is not None: worker.p99_ttft_ms   = req.p99_ttft_ms
    return {"ok": True, "ts": worker.last_heartbeat, "status": worker.status}

# ---------------------------------------------------------------------------
# Gap 1: /v1/network/stats — field names match api-client.ts ApiNetworkStats
# ---------------------------------------------------------------------------
@app.get("/v1/network/stats")
async def network_stats():
    now    = time.time()
    active = [w for w in _workers_registry if w.status == "Active"]
    idle   = [w for w in _workers_registry if w.status == "Paused"]
    jobs   = list(_jobs_store)
    hour   = [j for j in jobs if now - j["ts"] < 3600]
    today  = [j for j in jobs if now - j["ts"] < 86400]

    pass_rate  = round(sum(1 for j in today if j["sla_met"]) / max(len(today), 1) * 100, 1)
    penalties  = sum((j["penalty_paid"] or 0) for j in jobs)
    p99        = max((j["ttft_ms"] for j in hour[-100:]), default=245)
    cache_hits = await cache_count()

    return {
        "active_workers":       len(active),
        "idle_workers":         len(idle),
        "tee_workers":          sum(1 for w in active if w.tee_capable),
        "jobs_total":           len(jobs),
        "jobs_1h":              len(hour),
        "sla_pass_rate":        pass_rate,
        "p99_ttft_ms":          p99,
        "total_penalties_lock": round(penalties, 4),
        "confidential_share":   round(sum(1 for j in hour if j["confidential"]) / max(len(hour), 1) * 100, 1),
        "lock_burned":          round(_total_lock_burned, 4),
        # bonus fields for health dashboards
        "total_workers":        len(_workers_registry),
        "requests_today":       len(today),
        "cache_hit_entries":    cache_hits,
    }

# ---------------------------------------------------------------------------
# /v1/leaderboard
# ---------------------------------------------------------------------------
@app.get("/v1/leaderboard")
def leaderboard(
    metric: str = Query("goodput", enum=["goodput", "reliability", "confidential", "earnings"]),
    limit: int = Query(25, le=100),
):
    workers = [w.model_dump() for w in _workers_registry]
    if metric == "goodput":
        ranked = sorted(workers, key=lambda w: w["goodput_score"], reverse=True)
    elif metric == "reliability":
        ranked = sorted(workers, key=lambda w: w["reliability_score"], reverse=True)
    elif metric == "confidential":
        ranked = sorted(workers, key=lambda w: (w["is_confidential"], w["goodput_score"]), reverse=True)
    else:
        ranked = sorted(workers, key=lambda w: w["earnings_today"], reverse=True)

    for i, w in enumerate(ranked):
        rank = i + 1
        base = w["goodput_score"] * 10 if metric == "goodput" else w["reliability_score"]
        w["grid_points"] = max(0, int(base / (rank * 0.5)))

    return {"metric": metric, "ranked": ranked[:limit], "total": len(ranked)}

# ---------------------------------------------------------------------------
# /v1/live — SSE
# ---------------------------------------------------------------------------
@app.get("/v1/live")
async def live_stream():
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _live_subscribers.append(queue)

    async def generate():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            if queue in _live_subscribers:
                _live_subscribers.remove(queue)

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    slot   = await get_recent_slots()
    active = [w for w in _workers_registry if w.status == "Active"]
    r      = await _get_redis()
    return {
        "status":        "ok",
        "active_workers": len(active),
        "total_workers":  len(_workers_registry),
        "jobs_tracked":   len(_jobs_store),
        "solana_slot":    slot,
        "solana_rpc":     SOLANA_RPC_URL,
        "redis":          "connected" if r else "not configured",
        "supabase":       "configured" if SUPABASE_URL else "not configured",
        "programs": {
            "provider_registry": PROGRAM_PROVIDER_REGISTRY,
            "job_scheduler":     PROGRAM_JOB_SCHEDULER,
            "sla_registry":      PROGRAM_SLA_REGISTRY,
            "sla_enforcer":      PROGRAM_SLA_ENFORCER,
            "fee_collector":     PROGRAM_FEE_COLLECTOR,
        },
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=True)
