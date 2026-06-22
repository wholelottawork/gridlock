"""
GET /v1/live  — Server-Sent Events stream for real-time dashboard updates.
"""
import asyncio
import json
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from state import state

router = APIRouter(prefix="/v1")


@router.get("/live")
async def live_stream():
    """
    Streams new events as SSE.  Clients reconnect automatically on drop.
    Each message: `data: <json>\n\n`
    Keepalives every 15 s to prevent proxy timeouts.
    """
    async def event_gen():
        cursor = len(state.events)          # start from "now"
        last_keepalive = time.time()

        while True:
            await asyncio.sleep(0.4)

            # emit any new events
            snapshot = list(state.events)
            new_events = snapshot[cursor:]
            cursor = len(snapshot)

            for ev in new_events:
                yield f"data: {json.dumps(ev)}\n\n"

            # keepalive comment
            if time.time() - last_keepalive > 15:
                yield f": keepalive {int(time.time())}\n\n"
                last_keepalive = time.time()

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",      # disable nginx buffering
        },
    )
