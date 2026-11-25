"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiBase } from "./api-client";
import { clearChatStorage } from "./chat-storage";
import { migrateLocalDataIfNeeded } from "./migrate-local-data";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: "user" | "admin";
  active: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  requireAuth: () => boolean;
};

const TOKEN_KEY = "bodyagents_token";

export { apiBase };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    void fetch(`${apiBase()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          return;
        }
        const data = (await response.json()) as { user: AuthUser };
        const nextUser: AuthUser = {
          ...data.user,
          role: data.user.role === "admin" ? "admin" : "user",
          active: data.user.active !== false,
        };
        setToken(saved);
        setUser(nextUser);
        void migrateLocalDataIfNeeded(nextUser.id, saved).catch(() => undefined);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setLoginOpen(false);
    void migrateLocalDataIfNeeded(nextUser.id, nextToken).catch(() => undefined);
  }, []);

  const logout = useCallback(async () => {
    const current = localStorage.getItem(TOKEN_KEY);
    if (current) {
      await fetch(`${apiBase()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${current}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    clearChatStorage();
    window.dispatchEvent(new CustomEvent("bodyagents:auth-logout"));
  }, []);

  const requireAuth = useCallback(() => {
    if (user) return true;
    setLoginOpen(true);
    return false;
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      loginOpen,
      setLoginOpen,
      setSession,
      logout,
      requireAuth,
    }),
    [user, token, loading, loginOpen, setSession, logout, requireAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
