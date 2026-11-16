"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Lock, MessageCircle, NotebookPen, Send, Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { personaLabels, type PersonaId } from "../lib/personas";
import { addNote } from "../lib/notes";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  philosopherId: PersonaId;
  onOpenNotes?: () => void;
};

function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
}

/** Strip common Markdown so chat bubbles stay plain text. */
function toPlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^\w])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sessionKey(userId: string, philosopherId: PersonaId) {
  return `bodyagents_chat_session_${userId}_${philosopherId}`;
}

function historyKey(userId: string, philosopherId: PersonaId) {
  return `bodyagents_chat_history_${userId}_${philosopherId}`;
}

function welcomeMessage(title: string, signedIn: boolean): ChatMessage {
  return {
    id: "welcome",
    role: "system",
    content: signedIn
      ? `Hi! I'm ${title}. Ask me anything about how I work in the body.`
      : `Sign in to chat with ${title} and save notes from our conversation.`,
  };
}

function getOrCreateSessionId(philosopherId: PersonaId, userId: string): string {
  const key = sessionKey(userId, philosopherId);
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}`;
  localStorage.setItem(key, created);
  return created;
}

function loadHistory(userId: string, philosopherId: PersonaId, title: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(userId, philosopherId));
    if (!raw) return [welcomeMessage(title, true)];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [welcomeMessage(title, true)];
    return parsed.filter(
      (message) =>
        message &&
        typeof message.id === "string" &&
        typeof message.content === "string" &&
        (message.role === "user" || message.role === "assistant" || message.role === "system"),
    );
  } catch {
    return [welcomeMessage(title, true)];
  }
}

function saveHistory(userId: string, philosopherId: PersonaId, messages: ChatMessage[]) {
  try {
    localStorage.setItem(historyKey(userId, philosopherId), JSON.stringify(messages));
  } catch {
    // Ignore quota / private-mode failures; chat still works for the current view.
  }
}

function clearUserChatStorage(userId: string) {
  const prefixes = [
    `bodyagents_chat_session_${userId}_`,
    `bodyagents_chat_history_${userId}_`,
  ];
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

export function ChatPanel({ philosopherId, onOpenNotes }: Props) {
  const { user, requireAuth } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notedIds, setNotedIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  const title = useMemo(() => personaLabels[philosopherId], [philosopherId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setStreaming(false);
    setError(null);
    setStatus("idle");
    setNotedIds(new Set());
    assistantIdRef.current = null;
    hydratedRef.current = false;

    if (!user) {
      setMessages([welcomeMessage(title, false)]);
      return;
    }

    setMessages(loadHistory(user.id, philosopherId, title));
    hydratedRef.current = true;
  }, [philosopherId, title, user]);

  useEffect(() => {
    if (!user || !hydratedRef.current || streaming) return;
    saveHistory(user.id, philosopherId, messages);
  }, [messages, philosopherId, user, streaming]);

  useEffect(() => {
    const onLogout = () => {
      socketRef.current?.close();
      socketRef.current = null;
      setStreaming(false);
      setStatus("idle");
      setNotedIds(new Set());
      if (user) clearUserChatStorage(user.id);
      setMessages([]);
      hydratedRef.current = false;
    };
    window.addEventListener("bodyagents:auth-logout", onLogout);
    return () => window.removeEventListener("bodyagents:auth-logout", onLogout);
  }, [user]);

  const ensureSocket = () =>
    new Promise<WebSocket>((resolve, reject) => {
      if (!user) {
        reject(new Error("Not signed in"));
        return;
      }
      const existing = socketRef.current;
      if (existing && existing.readyState === WebSocket.OPEN) {
        resolve(existing);
        return;
      }

      setStatus("connecting");
      const activeSessionId = getOrCreateSessionId(philosopherId, user.id);
      const url = `${wsBaseUrl()}/api/v1/ws/chat/${philosopherId}/${activeSessionId}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("open");
        setError(null);
        resolve(socket);
      };

      socket.onerror = () => {
        setStatus("error");
        setError("Could not reach BodyAgents API. Is the backend running?");
        reject(new Error("WebSocket error"));
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setStatus("idle");
        }
      };

      socket.onmessage = (event) => {
        const raw = String(event.data);
        if (raw.startsWith("{") && raw.endsWith("}")) {
          try {
            const parsed = JSON.parse(raw) as { type?: string; message?: string };
            if (parsed.type === "done") {
              setStreaming(false);
              assistantIdRef.current = null;
              return;
            }
            if (parsed.type === "error") {
              setStreaming(false);
              setError(parsed.message ?? "Agent error");
              assistantIdRef.current = null;
              return;
            }
          } catch {
            // token chunk
          }
        }

        const assistantId = assistantIdRef.current;
        if (!assistantId) {
          const id = `a-${Date.now()}`;
          assistantIdRef.current = id;
          setMessages((prev) => [...prev, { id, role: "assistant", content: raw }]);
          return;
        }
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + raw }
              : message,
          ),
        );
      };
    });

  const noteMessage = (message: ChatMessage) => {
    if (!requireAuth() || !user) return;
    if (!message.content.trim() || message.role === "system") return;
    addNote({
      userId: user.id,
      text: toPlainText(message.content),
      source: `${title} chat`,
      personaId: philosopherId,
    });
    setNotedIds((prev) => new Set(prev).add(message.id));
    onOpenNotes?.();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requireAuth() || !user) return;
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    setStreaming(true);
    assistantIdRef.current = null;

    try {
      const socket = await ensureSocket();
      socket.send(text);
    } catch {
      setStreaming(false);
    }
  };

  if (!user) {
    return (
      <section className="chat-panel chat-locked" aria-label={`${title} chat locked`}>
        <header className="chat-header">
          <Lock size={15} />
          <div>
            <strong>Ask {title}</strong>
            <small>Sign in required</small>
          </div>
        </header>
        <div className="chat-lock-body">
          <p>Sign in to chat with {title} and save answers to Notes.</p>
          <button type="button" onClick={() => requireAuth()}>
            Sign in to chat
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-panel" aria-label={`${title} chat`}>
      <header className="chat-header">
        <MessageCircle size={15} />
        <div>
          <strong>Ask {title}</strong>
          <small>{status === "open" ? "Connected" : status === "connecting" ? "Connecting…" : "Ready"}</small>
        </div>
        <Sparkles size={14} />
      </header>

      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble ${message.role}`}>
            <p>{message.role === "assistant" ? toPlainText(message.content) : message.content}</p>
            {message.role !== "system" && message.content.trim() && (
              <button
                type="button"
                className={`note-it ${notedIds.has(message.id) ? "saved" : ""}`}
                onClick={() => noteMessage(message)}
                disabled={streaming && message.id === assistantIdRef.current}
              >
                <NotebookPen size={12} />
                {notedIds.has(message.id) ? "Noted" : "Note it"}
              </button>
            )}
          </div>
        ))}
        {streaming && <div className="chat-typing">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="chat-error">{error}</p>}

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Ask ${title} a question…`}
          disabled={streaming}
          aria-label="Chat message"
        />
        <button type="submit" disabled={streaming || !input.trim()} aria-label="Send message">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
