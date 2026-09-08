export type StudyNote = {
  id: string;
  userId: string;
  text: string;
  source: string;
  personaId?: string;
  createdAt: string;
};

const STORAGE_KEY = "bodyagents_notes";

function readAll(): StudyNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudyNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(notes: StudyNote[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  window.dispatchEvent(new CustomEvent("bodyagents:notes-changed"));
}

export function loadNotes(userId: string | null | undefined): StudyNote[] {
  if (!userId) return [];
  return readAll().filter((note) => note.userId === userId);
}

export function addNote(input: {
  userId: string;
  text: string;
  source: string;
  personaId?: string;
}): StudyNote {
  const note: StudyNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: input.userId,
    text: input.text.trim(),
    source: input.source,
    personaId: input.personaId,
    createdAt: new Date().toISOString(),
  };
  writeAll([note, ...readAll()]);
  return note;
}

export function deleteNote(id: string, userId: string): void {
  writeAll(readAll().filter((note) => !(note.id === id && note.userId === userId)));
}
