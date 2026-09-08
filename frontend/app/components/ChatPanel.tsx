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
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8001";
}

function getOrCreateSessionId(philosopherId: PersonaId, userId: string): string {
  const key = `bodyagents_chat_session_${userId}_${philosopherId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}`;
  sessionStorage.setItem(key, created);
  return created;
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

  const title = useMemo(() => personaLabels[philosopherId], [philosopherId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setMessages([
      {
        id: "welcome",
        role: "system",
        content: user
          ? `Hi! I'm ${title}. Ask me anything about how I work in the body.`
          : `Sign in to chat with ${title} and save notes from our conversation.`,
      },
    ]);
    setStreaming(false);
    setError(null);
    setStatus("idle");
    setNotedIds(new Set());
  }, [philosopherId, title, user]);

  useEffect(() => {
    const onLogout = () => {
      socketRef.current?.close();
      socketRef.current = null;
      setStreaming(false);
      setStatus("idle");
      setNotedIds(new Set());
      setMessages([]);
    };
    window.addEventListener("bodyagents:auth-logout", onLogout);
    return () => window.removeEventListener("bodyagents:auth-logout", onLogout);
  }, []);

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
      text: message.content,
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
            <p>{message.content}</p>
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
