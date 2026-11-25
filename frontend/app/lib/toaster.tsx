"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type ToastType = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-3), { id, message, type }]);
    timers.current.set(
      id,
      setTimeout(() => dismiss(id), type === "error" ? 5000 : 3500),
    );
  }, [dismiss]);

  useEffect(() => {
    const onHttpError = (event: Event) => {
      const detail = (event as CustomEvent<{ status: number; message: string }>).detail;
      if (detail) toast(detail.message, "error");
    };
    window.addEventListener("bodyagents:http-error", onHttpError);
    return () => window.removeEventListener("bodyagents:http-error", onHttpError);
  }, [toast]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`toast-message ${item.type}`}
            role={item.type === "error" ? "alert" : "status"}
          >
            {item.type === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            <span>{item.message}</span>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
