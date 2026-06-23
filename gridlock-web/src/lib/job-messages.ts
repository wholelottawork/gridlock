/**
 * Worker job message contract — shared by browser worker, desktop daemon, and CLI.
 *
 * Every dispatched job includes the full conversation in `messages[]`.
 * Workers must not rely on prior jobs for context; use this array as the
 * complete prompt for inference (plus an optional system message).
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole | string;
  content: string;
}

/** Shape of job:new (WebSocket) and GET /v1/jobs/next (REST poll). */
export interface WorkerJobPayload {
  id?: string;
  job_id?: string;
  model: string;
  messages: ChatMessage[];
  sla_tier?: string;
  max_tokens?: number;
  output_tokens?: number;
}

function formatDate(now = new Date()): string {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function dateSystemPrompt(now = new Date()): string {
  const formatted = formatDate(now);
  return (
    `The current date is ${formatted}. ` +
    `You have this date. If the user asks for today's date, answer with "${formatted}" only. ` +
    `Do not say you lack access to the current date or real-world information.`
  );
}

/** Normalize job messages for inference backends (WebLLM, vLLM, Ollama, etc.). */
export function prepareInferenceMessages(
  jobMessages: ChatMessage[],
  options?: { systemPrompt?: string; now?: Date },
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const now = options?.now ?? new Date();
  const formatted = formatDate(now);
  const system = options?.systemPrompt ?? dateSystemPrompt(now);
  const turns = jobMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Small models (e.g. Llama 3.2 1B in WebLLM) often ignore system role; prefix the latest user turn.
  if (turns.length > 0 && turns[turns.length - 1]!.role === "user") {
    const last = turns[turns.length - 1]!;
    turns[turns.length - 1] = {
      role: "user",
      content: `[Current date: ${formatted}]\n\n${last.content}`,
    };
  }

  return [{ role: "system", content: system }, ...turns];
}
