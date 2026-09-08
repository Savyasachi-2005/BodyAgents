"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { apiBase, useAuth } from "../lib/auth-context";

export function AuthMenu() {
  const { user, loginOpen, setLoginOpen, setSession, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loginOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setLoginOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [loginOpen, setLoginOpen]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === "signup" ? "/api/v1/auth/signup" : "/api/v1/auth/login";
      const body = mode === "signup" ? { name, email, password } : { email, password };
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
      setSession(data.token, data.user);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-menu" ref={panelRef}>
      <button
        className="profile"
        type="button"
        aria-label={user ? "Open account menu" : "Sign in"}
        aria-expanded={loginOpen}
        onClick={() => setLoginOpen(!loginOpen)}
      >
        <span>{user?.initials ?? "?"}</span>
        <ChevronDown size={15} />
      </button>

      {loginOpen && (
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
              <button
                type="button"
                className="auth-logout"
                onClick={async () => {
                  await logout();
                  setLoginOpen(false);
                }}
              >
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
