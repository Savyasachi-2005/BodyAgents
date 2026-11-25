import type { OrganId } from "./anatomy-data";
import { apiFetch } from "./api-client";

export type OrganStar = 0 | 1 | 2 | 3;

export type BadgeId =
  | "first_quiz"
  | "first_perfect"
  | "three_organs"
  | "streak_7";

export const BADGE_META: Record<BadgeId, { title: string; detail: string }> = {
  first_quiz: { title: "First steps", detail: "Completed your first organ quiz" },
  first_perfect: { title: "Perfect score", detail: "Scored 5/5 on any organ quiz" },
  three_organs: { title: "Curious explorer", detail: "Earned at least 1★ on three organs" },
  streak_7: { title: "Week of study", detail: "Kept a 7-day quiz streak" },
};

export type QuizProgress = {
  userId: string;
  xp: number;
  coins: number;
  streak: number;
  lastQuizDate: string | null;
  organStars: Partial<Record<OrganId, OrganStar>>;
  bestScores: Partial<Record<OrganId, number>>;
  badges: BadgeId[];
};

export type QuizResultApply = {
  organId: OrganId;
  correctCount: number;
  total: number;
};

export type QuizResultDelta = {
  xpEarned: number;
  coinsEarned: number;
  stars: OrganStar;
  previousBest: number | null;
  newBadges: BadgeId[];
  progress: QuizProgress;
};

const EVENT = "bodyagents:quiz-progress-changed";
const LOCAL_KEY = "bodyagents_quiz_progress";

function emitChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function emptyProgress(userId: string): QuizProgress {
  return {
    userId,
    xp: 0,
    coins: 0,
    streak: 0,
    lastQuizDate: null,
    organStars: {},
    bestScores: {},
    badges: [],
  };
}

/** Legacy local rows for one-time migrate. */
export function readLocalProgress(userId: string): QuizProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuizProgress[];
    if (!Array.isArray(parsed)) return null;
    return parsed.find((row) => row.userId === userId) ?? null;
  } catch {
    return null;
  }
}

export function clearLocalProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_KEY);
}

export async function loadProgress(userId: string | null | undefined): Promise<QuizProgress | null> {
  if (!userId) return null;
  const data = await apiFetch<{ progress: QuizProgress }>("/api/v1/quiz/progress");
  return data.progress ?? emptyProgress(userId);
}

export async function applyQuizResult(
  userId: string,
  result: QuizResultApply,
): Promise<QuizResultDelta> {
  const data = await apiFetch<QuizResultDelta>("/api/v1/quiz/result", {
    method: "POST",
    body: JSON.stringify({
      organ_id: result.organId,
      correct_count: result.correctCount,
      total: result.total,
    }),
  });
  emitChanged();
  return {
    ...data,
    progress: data.progress ?? emptyProgress(userId),
  };
}

export function subscribeQuizProgress(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener(EVENT, handler);
  };
}
