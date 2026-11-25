import { apiFetch } from "./api-client";

export type StudyNote = {
  id: string;
  userId: string;
  text: string;
  source: string;
  personaId?: string;
  createdAt: string;
};

const EVENT = "bodyagents:notes-changed";
const LOCAL_KEY = "bodyagents_notes";

function emitChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

/** Read legacy local notes for one-time migrate (do not use for UI after migrate). */
export function readLocalNotes(userId: string): StudyNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudyNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((note) => note.userId === userId);
  } catch {
    return [];
  }
}

export function clearLocalNotes(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_KEY);
}

export async function loadNotes(userId: string | null | undefined): Promise<StudyNote[]> {
  if (!userId) return [];
  const data = await apiFetch<{ notes: StudyNote[] }>("/api/v1/notes/");
  return data.notes;
}

export async function addNote(input: {
  userId: string;
  text: string;
  source: string;
  personaId?: string;
}): Promise<StudyNote> {
  const data = await apiFetch<{ note: StudyNote }>("/api/v1/notes/", {
    method: "POST",
    body: JSON.stringify({
      text: input.text.trim(),
      source: input.source,
      persona_id: input.personaId,
    }),
  });
  emitChanged();
  return data.note;
}

export async function deleteNote(id: string, _userId: string): Promise<void> {
  await apiFetch<{ status: string }>(`/api/v1/notes/${id}`, { method: "DELETE" });
  emitChanged();
}
