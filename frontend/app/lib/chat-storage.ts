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
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    sessionStorage.setItem(key, created);
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
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ChatMessage[];
      }
    }
  } catch (error) {
    console.error("Failed to load chat messages from session storage:", error);
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
    sessionStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error("Failed to save chat messages to session storage:", error);
  }
}

export function clearChatStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith(CHAT_STORAGE_PREFIX) || key.startsWith(CHAT_SESSION_PREFIX))
      ) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Failed to clear chat storage from session storage:", error);
  }
}
