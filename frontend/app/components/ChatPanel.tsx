"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Lock, MessageCircle, Mic, MicOff, NotebookPen, Send, Sparkles } from "lucide-react";
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

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionConstructor(): (new () => ISpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const anyWindow = window as unknown as {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  };
  return anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition || null;
}

export function cleanChatText(text: string): string {
  if (!text) return "";
  return text
    .replace(/(^|\r?\n)(\s*(?:[-*•]\s+)?)\*\*\s*/g, "$1$2")
    .replace(/\s*\*\*\s+/g, " ")
    .replace(/\*\*/g, "");
}

function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
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
  const title = useMemo(() => personaLabels[philosopherId], [philosopherId]);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "system",
      content: user
        ? `Hi! I'm ${personaLabels[philosopherId]}. Ask me anything about how I work in the body.`
        : `Sign in to chat with ${personaLabels[philosopherId]} and save notes from our conversation.`,
    },
  ]);
  const [prevPhilosopherId, setPrevPhilosopherId] = useState(philosopherId);
  const [prevUser, setPrevUser] = useState(user);
  const [streaming, setStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notedIds, setNotedIds] = useState<Set<string>>(new Set());
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const baseTextRef = useRef<string>("");
  const assistantIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  if (philosopherId !== prevPhilosopherId || user !== prevUser) {
    setPrevPhilosopherId(philosopherId);
    setPrevUser(user);
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
    setActiveAssistantId(null);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [philosopherId, user]);

  useEffect(() => {
    const onLogout = () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsListening(false);
      }
      socketRef.current?.close();
      socketRef.current = null;
      setStreaming(false);
      setStatus("idle");
      setNotedIds(new Set());
      setMessages([]);
      setActiveAssistantId(null);
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
              const finishedId = assistantIdRef.current;
              if (finishedId) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === finishedId
                      ? { ...msg, content: cleanChatText(msg.content) }
                      : msg,
                  ),
                );
              }
              assistantIdRef.current = null;
              setActiveAssistantId(null);
              return;
            }
            if (parsed.type === "error") {
              setStreaming(false);
              setError(parsed.message ?? "Agent error");
              assistantIdRef.current = null;
              setActiveAssistantId(null);
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
          setActiveAssistantId(id);
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
    const textToSave = cleanChatText(message.content).trim();
    if (!textToSave || message.role === "system") return;
    addNote({
      userId: user.id,
      text: textToSave,
      source: `${title} chat`,
      personaId: philosopherId,
    });
    setNotedIds((prev) => new Set(prev).add(message.id));
    onOpenNotes?.();
  };

  const toggleListening = () => {
    if (streaming) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

      baseTextRef.current = input.trim() ? `${input.trim()} ` : "";

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(baseTextRef.current + transcript);
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed") {
          setError("Microphone permission was denied. Please allow microphone access.");
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          setError(`Voice input error: ${event.error}`);
        }
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setError("Unable to start microphone. Please check your browser audio settings.");
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    if (!requireAuth() || !user) return;
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    setStreaming(true);
    assistantIdRef.current = null;
    setActiveAssistantId(null);

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
            <p>{cleanChatText(message.content)}</p>
            {message.role !== "system" && message.content.trim() && (
              <button
                type="button"
                className={`note-it ${notedIds.has(message.id) ? "saved" : ""}`}
                onClick={() => noteMessage(message)}
                disabled={streaming && message.id === activeAssistantId}
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
          placeholder={isListening ? "Listening… speak now" : `Ask ${title} a question…`}
          disabled={streaming}
          className={isListening ? "is-listening" : ""}
          aria-label="Chat message"
        />
        <button
          type="button"
          className={`chat-mic-btn ${isListening ? "listening" : ""}`}
          onClick={toggleListening}
          disabled={streaming}
          aria-label={isListening ? "Stop voice input" : "Voice input"}
          title={isListening ? "Stop listening" : "Voice input"}
        >
          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <button type="submit" disabled={streaming || !input.trim()} aria-label="Send message">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
