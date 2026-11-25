const TOKEN_KEY = "bodyagents_token";

export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  notificationHandled: boolean;

  constructor(status: number, message: string, notificationHandled = false) {
    super(message);
    this.status = status;
    this.notificationHandled = notificationHandled;
  }
}

export function isHttpErrorToastHandled(error: unknown): boolean {
  return error instanceof ApiError && error.notificationHandled;
}

export function formatHttpStatusMessage(status: number, detail?: string): string {
  const labels: Record<number, string> = {
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    408: "Request timed out",
    409: "Conflict",
    422: "Validation error",
    429: "Too many requests",
    500: "Server error",
    502: "Bad gateway",
    503: "Service unavailable",
    504: "Gateway timed out",
  };
  const label = labels[status] ?? "Request failed";
  return detail ? `${label} (${status}): ${detail}` : `${label} (${status})`;
}

export function notifyHttpStatusError(status: number, detail?: string): boolean {
  if (status < 400 || typeof window === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent("bodyagents:http-error", {
      detail: { status, message: formatHttpStatusMessage(status, detail) },
    }),
  );
  return true;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const token = options.token === undefined ? getAuthToken() : options.token;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    const notificationHandled = notifyHttpStatusError(response.status, detail);
    throw new ApiError(
      response.status,
      notificationHandled ? formatHttpStatusMessage(response.status, detail) : detail,
      notificationHandled,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
