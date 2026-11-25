import { apiFetch } from "./api-client";
import { clearChatStorage, readLocalChatsForMigrate } from "./chat-storage";
import { clearLocalNotes, readLocalNotes } from "./notes";
import { clearLocalProgress, readLocalProgress } from "./quiz-progress";

const MIGRATED_KEY = "bodyagents_mongo_migrated_users";

function alreadyMigrated(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(MIGRATED_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(ids) && ids.includes(userId);
  } catch {
    return false;
  }
}

function markMigrated(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(MIGRATED_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    const next = Array.isArray(ids) ? ids : [];
    if (!next.includes(userId)) next.push(userId);
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * One-time push of browser localStorage notes/quiz/chat into Mongo for this user.
 * Safe to call on every login — no-ops after first successful migrate flag.
 */
export async function migrateLocalDataIfNeeded(userId: string, token: string): Promise<void> {
  if (!userId || alreadyMigrated(userId)) return;

  const notes = readLocalNotes(userId).map((note) => ({
    text: note.text,
    source: note.source,
    persona_id: note.personaId,
    created_at: note.createdAt,
  }));
  const quiz = readLocalProgress(userId);
  const chats = readLocalChatsForMigrate(userId);

  const hasLocal = notes.length > 0 || Boolean(quiz && quiz.xp > 0) || chats.length > 0;
  if (!hasLocal) {
    markMigrated(userId);
    return;
  }

  await apiFetch("/api/v1/migrate", {
    method: "POST",
    token,
    body: JSON.stringify({
      notes,
      quiz: quiz
        ? {
            xp: quiz.xp,
            coins: quiz.coins,
            streak: quiz.streak,
            last_quiz_date: quiz.lastQuizDate,
            organ_stars: quiz.organStars,
            best_scores: quiz.bestScores,
            badges: quiz.badges,
          }
        : null,
      chats,
    }),
  });

  clearLocalNotes();
  clearLocalProgress();
  clearChatStorage();
  markMigrated(userId);
}
