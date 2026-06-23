"""Worker job message contract — mirror of gridlock-web/src/lib/job-messages.ts.

Every job includes the full conversation in messages[]. Workers are stateless;
do not rely on prior jobs for context.
"""

from __future__ import annotations

from datetime import date


def format_date(d: date | None = None) -> str:
    d = d or date.today()
    return d.strftime("%A, %B %d, %Y")


def date_system_prompt(d: date | None = None) -> str:
    formatted = format_date(d)
    return (
        f"The current date is {formatted}. "
        f"You have this date. If the user asks for today's date, answer with \"{formatted}\" only. "
        "Do not say you lack access to the current date or real-world information."
    )


def prepare_inference_messages(
    job_messages: list[dict],
    *,
    system_prompt: str | None = None,
    on_date: date | None = None,
) -> list[dict]:
    """Normalize job messages for vLLM / Ollama / llama.cpp chat APIs."""
    d = on_date or date.today()
    formatted = format_date(d)
    system = system_prompt if system_prompt is not None else date_system_prompt(d)
    turns = [
        {"role": m["role"], "content": m["content"]}
        for m in job_messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    if turns and turns[-1]["role"] == "user":
        turns[-1] = {
            **turns[-1],
            "content": f"[Current date: {formatted}]\n\n{turns[-1]['content']}",
        }
    return [{"role": "system", "content": system}, *turns]
