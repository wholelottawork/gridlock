import os
from dotenv import load_dotenv

load_dotenv()

GRIDLOCK_PROGRAM_ID  = os.getenv("GRIDLOCK_PROGRAM_ID", "GridLoCKXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
SOLANA_RPC_URL       = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
OPENAI_API_KEY       = os.getenv("OPENAI_API_KEY", "")
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY         = os.getenv("SUPABASE_KEY", "")

PORT                 = int(os.getenv("PORT", "8080"))

# Economics
PRICE_PER_1M_TOKENS  = float(os.getenv("PRICE_PER_1M_TOKENS", "8.5"))  # $LOCK
SLA_PENALTY_RATE     = 0.25   # 25% of fee as penalty on SLA miss
WORKER_SHARE         = 0.40   # 40% of fees go to the serving worker
STAKER_SHARE         = 0.60   # 60% of penalties go to stakers

# SLA TTFT targets (ms)
SLA_TARGETS = {
    "realtime":    200,
    "standard":    800,
    "batch":      5000,
    "confidential": 1200,
}
