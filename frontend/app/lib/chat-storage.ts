import { apiFetch } from "./api-client";
import type { PersonaId } from "./personas";

export type ChatSource = {
  title: string;
  publisher: string;
  url?: string;
  trust_tier?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: ChatSource[];
};

const CHAT_STORAGE_PREFIX = "bodyagents_chat_messages_";
const CHAT_SESSION_PREFIX = "bodyagents_chat_session_";

export function getChatStorageKey(philosopherId: PersonaId, userId: string): string {
  return `${CHAT_STORAGE_PREFIX}${userId}_${philosopherId}`;
}

export function getOrCreateSessionId(philosopherId: PersonaId, userId: string): string {
  const key = `${CHAT_SESSION_PREFIX}${userId}_${philosopherId}`;
  if (typeof window === "undefined") return `session-${Date.now()}`;
  try {
    const existing = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (existing) {
      localStorage.setItem(key, existing);
      return existing;
    }
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `session-${Date.now()}`;
  }
}

export function setSessionId(philosopherId: PersonaId, userId: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${CHAT_SESSION_PREFIX}${userId}_${philosopherId}`, sessionId);
}

/** Legacy local transcripts for migrate. */
export function readLocalChatsForMigrate(userId: string): {
  philosopher_id: string;
  session_id: string;
  messages: ChatMessage[];
}[] {
  if (typeof window === "undefined") return [];
  const out: { philosopher_id: string; session_id: string; messages: ChatMessage[] }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${CHAT_STORAGE_PREFIX}${userId}_`)) continue;
      const philosopherId = key.slice(`${CHAT_STORAGE_PREFIX}${userId}_`.length) as PersonaId;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const messages = JSON.parse(raw) as ChatMessage[];
      if (!Array.isArray(messages) || messages.length === 0) continue;
      const sessionId = getOrCreateSessionId(philosopherId, userId);
      out.push({ philosopher_id: philosopherId, session_id: sessionId, messages });
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function clearChatStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (
          key &&
          (key.startsWith(CHAT_STORAGE_PREFIX) || key.startsWith(CHAT_SESSION_PREFIX))
        ) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        store.removeItem(key);
      }
      toRemove.length = 0;
    }
  } catch (error) {
    console.error("Failed to clear chat storage:", error);
  }
}

export async function loadChatHistory(
  philosopherId: PersonaId,
  userId: string,
  defaultMessage: ChatMessage,
): Promise<ChatMessage[]> {
  try {
    const data = await apiFetch<{ sessionId: string | null; messages: ChatMessage[] }>(
      `/api/v1/chat/${philosopherId}`,
    );
    if (data.sessionId) {
      setSessionId(philosopherId, userId, data.sessionId);
    }
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      return data.messages;
    }
  } catch (error) {
    console.error("Failed to load chat history:", error);
  }
  return [defaultMessage];
}

export async function saveChatHistory(
  philosopherId: PersonaId,
  userId: string,
  messages: ChatMessage[],
): Promise<void> {
  const sessionId = getOrCreateSessionId(philosopherId, userId);
  try {
    await apiFetch(`/api/v1/chat/${philosopherId}`, {
      method: "PUT",
      body: JSON.stringify({ session_id: sessionId, messages }),
    });
  } catch (error) {
    console.error("Failed to save chat history:", error);
  }
}

/** @deprecated Prefer loadChatHistory — kept for transitional call sites. */
export function loadStoredMessages(
  philosopherId: PersonaId,
  userId: string,
  defaultMessage: ChatMessage,
): ChatMessage[] {
  return [defaultMessage];
}

/** @deprecated Prefer saveChatHistory */
export function saveStoredMessages(
  philosopherId: PersonaId,
  userId: string,
  messages: ChatMessage[],
): void {
  void saveChatHistory(philosopherId, userId, messages);
}
