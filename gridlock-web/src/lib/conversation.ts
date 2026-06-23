import type { ChatMessage } from "@/lib/job-messages";

export interface ConversationTurn {
  user: string;
  assistant: string;
}

/**
 * Client-side conversation helpers.
 *
 * Gridlock workers (browser, desktop, CLI) are stateless — they do not store
 * chat history. The client sends the full OpenAI-style messages[] on every
 * POST /v1/chat/completions call; the backend forwards that array unchanged
 * in each job payload (WebSocket push or REST poll).
 */
export function buildChatMessages(
  history: ConversationTurn[],
  nextUserMessage: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.user });
    messages.push({ role: "assistant", content: turn.assistant });
  }
  messages.push({ role: "user", content: nextUserMessage });
  return messages;
}

export const CONSOLE_CHAT_STORAGE_KEY = "gridlock:console:chat";

export interface StoredConsoleChat {
  playModel: string;
  playSla: string;
  playMessages: Array<{ prompt: string; content: string; meta: unknown }>;
}

export function loadStoredConsoleChat(): Partial<StoredConsoleChat> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(CONSOLE_CHAT_STORAGE_KEY) || "{}") as Partial<StoredConsoleChat>;
  } catch {
    return {};
  }
}

export function saveStoredConsoleChat(data: StoredConsoleChat) {
  sessionStorage.setItem(CONSOLE_CHAT_STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredConsoleChat() {
  sessionStorage.removeItem(CONSOLE_CHAT_STORAGE_KEY);
}
