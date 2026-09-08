"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { personaLabels, type PersonaId } from "../lib/personas";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  philosopherId: PersonaId;
};

function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
}

export function ChatPanel({ philosopherId }: Props) {
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}`,
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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
        content: `Hi! I'm ${title}. Ask me anything about how I work in the body.`,
      },
    ]);
    setStreaming(false);
    setError(null);
    setStatus("idle");
  }, [philosopherId, title]);

  const ensureSocket = () =>
    new Promise<WebSocket>((resolve, reject) => {
      const existing = socketRef.current;
      if (existing && existing.readyState === WebSocket.OPEN) {
        resolve(existing);
        return;
      }

      setStatus("connecting");
      const url = `${wsBaseUrl()}/api/v1/ws/chat/${philosopherId}/${sessionId}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("open");
        setError(null);
        resolve(socket);
      };

      socket.onerror = () => {
        setStatus("error");
        setError("Could not reach BodyAgents API. Is the backend running on port 8000?");
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
            {message.content}
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
