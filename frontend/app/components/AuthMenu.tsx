"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
};

const TOKEN_KEY = "bodyagents_token";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export function AuthMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    void fetch(`${apiBase()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          localStorage.removeItem(TOKEN_KEY);
          return;
        }
        const data = (await response.json()) as { user: AuthUser };
        setUser(data.user);
      })
      .catch(() => {
        /* backend may be offline */
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === "signup" ? "/api/v1/auth/signup" : "/api/v1/auth/login";
      const body =
        mode === "signup"
          ? { name, email, password }
          : { email, password };
      const response = await fetch(`${apiBase()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(", ")
              : "Authentication failed";
        throw new Error(message);
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      setPassword("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await fetch(`${apiBase()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setOpen(false);
  };

  return (
    <div className="auth-menu" ref={panelRef}>
      <button
        className="profile"
        type="button"
        aria-label={user ? "Open account menu" : "Sign in"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{user?.initials ?? "?"}</span>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="auth-panel" role="dialog" aria-label="Account">
          {user ? (
            <>
              <div className="auth-user">
                <UserRound size={16} />
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
              <button type="button" className="auth-logout" onClick={logout}>
                <LogOut size={14} /> Sign out
              </button>
            </>
          ) : (
            <>
              <div className="auth-tabs">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={mode === "signup" ? "active" : ""}
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </div>
              <form className="auth-form" onSubmit={submit}>
                {mode === "signup" && (
                  <label>
                    Name
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      minLength={2}
                      autoComplete="name"
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <button type="submit" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
