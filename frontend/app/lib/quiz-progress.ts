import type { OrganId } from "./anatomy-data";
import { organs } from "./anatomy-data";

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

const STORAGE_KEY = "bodyagents_quiz_progress";
const EVENT = "bodyagents:quiz-progress-changed";

function emptyProgress(userId: string): QuizProgress {
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

function readAll(): QuizProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuizProgress[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: QuizProgress[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(a: string, b: string): number {
  const aDate = new Date(`${a}T12:00:00`);
  const bDate = new Date(`${b}T12:00:00`);
  return Math.round((bDate.getTime() - aDate.getTime()) / 86_400_000);
}

export function starsForScore(correct: number, total: number): OrganStar {
  if (total <= 0) return 0;
  if (correct >= total) return 3;
  if (correct >= total - 1) return 2;
  if (correct >= Math.ceil(total * 0.6)) return 1;
  return 0;
}

export function loadProgress(userId: string | null | undefined): QuizProgress | null {
  if (!userId) return null;
  return readAll().find((row) => row.userId === userId) ?? emptyProgress(userId);
}

export function applyQuizResult(userId: string, result: QuizResultApply): QuizResultDelta {
  const current = loadProgress(userId) ?? emptyProgress(userId);
  const previousBest = current.bestScores[result.organId] ?? null;
  const improvedAnswers = Math.max(0, result.correctCount - (previousBest ?? 0));
  const xpFromAnswers = improvedAnswers * 10;
  const coinsFromAnswers = improvedAnswers;
  const perfect = result.correctCount === result.total && result.total > 0;
  const earnedPerfectBonus = perfect && previousBest !== result.total;
  const xpBonus = earnedPerfectBonus ? 15 : 0;
  const coinBonus = earnedPerfectBonus ? 3 : 0;
  const xpEarned = xpFromAnswers + xpBonus;
  const coinsEarned = coinsFromAnswers + coinBonus;
  const stars = starsForScore(result.correctCount, result.total);

  const today = todayKey();
  let streak = current.streak;
  if (!current.lastQuizDate) {
    streak = 1;
  } else if (current.lastQuizDate === today) {
    streak = Math.max(1, current.streak);
  } else {
    const gap = daysBetween(current.lastQuizDate, today);
    streak = gap === 1 ? current.streak + 1 : 1;
  }

  const prevStars = current.organStars[result.organId] ?? 0;
  const nextStars = Math.max(prevStars, stars) as OrganStar;
  const prevBest = current.bestScores[result.organId] ?? 0;
  const nextBest = Math.max(prevBest, result.correctCount);

  const badges = new Set<BadgeId>(current.badges);
  const newBadges: BadgeId[] = [];
  const unlock = (id: BadgeId) => {
    if (!badges.has(id)) {
      badges.add(id);
      newBadges.push(id);
    }
  };

  unlock("first_quiz");
  if (perfect) unlock("first_perfect");

  const organStars = { ...current.organStars, [result.organId]: nextStars };
  const starredOrgans = organs.filter((organ) => (organStars[organ.id] ?? 0) >= 1).length;
  if (starredOrgans >= 3) unlock("three_organs");
  if (streak >= 7) unlock("streak_7");

  const progress: QuizProgress = {
    userId,
    xp: current.xp + xpEarned,
    coins: current.coins + coinsEarned,
    streak,
    lastQuizDate: today,
    organStars,
    bestScores: { ...current.bestScores, [result.organId]: nextBest },
    badges: Array.from(badges),
  };

  const others = readAll().filter((row) => row.userId !== userId);
  writeAll([progress, ...others]);

  return { xpEarned, coinsEarned, stars, previousBest, newBadges, progress };
}

export function subscribeQuizProgress(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
