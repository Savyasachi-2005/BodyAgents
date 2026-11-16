import type { PersonaId } from "./personas";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
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

export function loadStoredMessages(
  philosopherId: PersonaId,
  userId: string,
  defaultMessage: ChatMessage,
): ChatMessage[] {
  if (typeof window === "undefined") return [defaultMessage];
  try {
    const key = getChatStorageKey(philosopherId, userId);
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localStorage.setItem(key, raw);
        return parsed as ChatMessage[];
      }
    }
  } catch (error) {
    console.error("Failed to load chat messages from storage:", error);
  }
  return [defaultMessage];
}

export function saveStoredMessages(
  philosopherId: PersonaId,
  userId: string,
  messages: ChatMessage[],
): void {
  if (typeof window === "undefined") return;
  try {
    const key = getChatStorageKey(philosopherId, userId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error("Failed to save chat messages to storage:", error);
  }
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
