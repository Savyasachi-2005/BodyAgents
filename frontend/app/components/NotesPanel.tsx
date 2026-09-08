"use client";

import { useEffect, useState } from "react";
import { NotebookPen, Trash2, X } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { deleteNote, loadNotes, type StudyNote } from "../lib/notes";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NotesPanel({ open, onClose }: Props) {
  const { user, requireAuth } = useAuth();
  const [notes, setNotes] = useState<StudyNote[]>([]);

  useEffect(() => {
    if (!open) return;
    if (!user) {
      setNotes([]);
      requireAuth();
      onClose();
      return;
    }
    const refresh = () => setNotes(loadNotes(user.id));
    refresh();
    window.addEventListener("bodyagents:notes-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("bodyagents:auth-logout", onClose);
    return () => {
      window.removeEventListener("bodyagents:notes-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("bodyagents:auth-logout", onClose);
    };
  }, [open, user, requireAuth, onClose]);

  if (!open || !user) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="notes-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close notes">
          <X size={18} />
        </button>
        <header className="notes-header">
          <NotebookPen size={18} />
          <div>
            <em>Saved from chat · {user.name}</em>
            <h2 id="notes-title">My notes</h2>
          </div>
        </header>

        {notes.length === 0 ? (
          <p className="notes-empty">
            No notes yet. In chat, click <b>Note it</b> on a message to save it here.
          </p>
        ) : (
          <ul className="notes-list">
            {notes.map((note) => (
              <li key={note.id} className="notes-item">
                <div>
                  <small>
                    {note.source} · {new Date(note.createdAt).toLocaleString()}
                  </small>
                  <p>{note.text}</p>
                </div>
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => {
                    deleteNote(note.id, user.id);
                    setNotes(loadNotes(user.id));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
