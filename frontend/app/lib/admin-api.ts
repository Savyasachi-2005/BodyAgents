import {
  ApiError,
  apiBase,
  apiFetch,
  formatHttpStatusMessage,
  getAuthToken,
  notifyHttpStatusError,
} from "./api-client";
import type { OrganId } from "./anatomy-data";
import type { QuizQuestion } from "./quiz-data";
import type { QuizProgress } from "./quiz-progress";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: "user" | "admin";
  active: boolean;
  createdAt?: string | null;
};

export type QuizBank = {
  organId: OrganId;
  questions: QuizQuestion[];
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type ProgressRow = {
  user: AdminUser;
  progress: QuizProgress;
};

export async function fetchQuizBanks(): Promise<QuizBank[]> {
  const data = await apiFetch<{ banks: QuizBank[] }>("/api/v1/admin/quiz/questions");
  return data.banks;
}

export async function saveQuizBank(organId: OrganId, questions: QuizQuestion[]): Promise<QuizBank> {
  return apiFetch<QuizBank>(`/api/v1/admin/quiz/questions/${organId}`, {
    method: "PUT",
    body: JSON.stringify({ questions }),
  });
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await apiFetch<{ users: AdminUser[] }>("/api/v1/admin/users");
  return data.users;
}

export async function patchAdminUser(
  userId: string,
  patch: Partial<Pick<AdminUser, "name" | "email" | "role" | "active">>,
): Promise<AdminUser> {
  const data = await apiFetch<{ user: AdminUser }>(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.user;
}

export async function fetchAdminProgress(): Promise<ProgressRow[]> {
  const data = await apiFetch<{ rows: ProgressRow[] }>("/api/v1/admin/progress");
  return data.rows;
}

export async function downloadProgressExcel(userId?: string): Promise<void> {
  const token = getAuthToken();
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`${apiBase()}/api/v1/admin/progress/export.xlsx${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const notificationHandled = notifyHttpStatusError(response.status, "Excel export failed");
    throw new ApiError(
      response.status,
      notificationHandled
        ? formatHttpStatusMessage(response.status, "Excel export failed")
        : "Excel export failed",
      notificationHandled,
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = userId ? `progress-${userId}.xlsx` : "bodyagents-progress-all.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchOrganQuestions(organId: OrganId): Promise<QuizQuestion[] | null> {
  try {
    const data = await apiFetch<{ organId: string; questions: QuizQuestion[] }>(
      `/api/v1/quiz/questions/${organId}`,
      { token: null },
    );
    if (!Array.isArray(data.questions) || data.questions.length === 0) return null;
    return data.questions;
  } catch {
    return null;
  }
}
