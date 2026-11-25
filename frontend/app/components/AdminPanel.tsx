"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Download,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  downloadProgressExcel,
  fetchAdminProgress,
  fetchAdminUsers,
  fetchQuizBanks,
  patchAdminUser,
  saveQuizBank,
  type AdminUser,
  type ProgressRow,
  type QuizBank,
} from "../lib/admin-api";
import { organs, type OrganId } from "../lib/anatomy-data";
import type { QuizQuestion } from "../lib/quiz-data";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toaster";
import { isHttpErrorToastHandled } from "../lib/api-client";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = "quizzes" | "users" | "progress";

const emptyQuestion = (organId: OrganId, index: number): QuizQuestion => ({
  id: `${organId}-new-${Date.now()}-${index}`,
  prompt: "",
  choices: ["", "", "", ""],
  correctIndex: 0,
  explain: "",
});

export function AdminPanel({ open, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("quizzes");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [banks, setBanks] = useState<QuizBank[]>([]);
  const [organId, setOrganId] = useState<OrganId>("heart");
  const [draft, setDraft] = useState<QuizQuestion[]>([]);
  const [dirty, setDirty] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rows, setRows] = useState<ProgressRow[]>([]);

  const currentBank = useMemo(
    () => banks.find((b) => b.organId === organId),
    [banks, organId],
  );

  useEffect(() => {
    if (!open || !user || user.role !== "admin") return;
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const [nextBanks, nextUsers, nextRows] = await Promise.all([
          fetchQuizBanks(),
          fetchAdminUsers(),
          fetchAdminProgress(),
        ]);
        if (cancelled) return;
        setBanks(nextBanks);
        setUsers(nextUsers);
        setRows(nextRows);
        const initial = nextBanks.find((b) => b.organId === organId)?.questions ?? [];
        setDraft(initial.map((q) => ({ ...q, choices: [...q.choices] as QuizQuestion["choices"] })));
        setDirty(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load admin data");
      }
    })();
    return () => {
      cancelled = true;
    };
    // organId intentionally omitted — only reload on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const qs = currentBank?.questions ?? [];
    setDraft(qs.map((q) => ({ ...q, choices: [...q.choices] as QuizQuestion["choices"] })));
    setDirty(false);
  }, [organId, currentBank, open]);

  if (!open || !user || user.role !== "admin") return null;

  const selectOrgan = (next: OrganId) => {
    if (dirty && !window.confirm("Discard unsaved quiz edits?")) return;
    setOrganId(next);
  };

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    setDraft((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
    setDirty(true);
  };

  const updateChoice = (qIndex: number, cIndex: number, value: string) => {
    setDraft((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const choices = [...q.choices] as QuizQuestion["choices"];
        choices[cIndex] = value;
        return { ...q, choices };
      }),
    );
    setDirty(true);
  };

  const addQuestion = () => {
    setDraft((prev) => [...prev, emptyQuestion(organId, prev.length)]);
    setDirty(true);
  };

  const removeQuestion = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const saveQuiz = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveQuizBank(organId, draft);
      setBanks((prev) => {
        const others = prev.filter((b) => b.organId !== organId);
        return [...others, saved].sort((a, b) => a.organId.localeCompare(b.organId));
      });
      setDirty(false);
      toast("Quiz bank saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      if (!isHttpErrorToastHandled(err)) toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onPatchUser = async (
    target: AdminUser,
    patch: Partial<Pick<AdminUser, "name" | "email" | "role" | "active">>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await patchAdminUser(target.id, patch);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setRows((prev) =>
        prev.map((row) =>
          row.user.id === updated.id ? { ...row, user: { ...row.user, ...updated } } : row,
        ),
      );
      toast("User updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
      if (!isHttpErrorToastHandled(err)) toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onExport = async (uid?: string) => {
    setBusy(true);
    setError(null);
    try {
      await downloadProgressExcel(uid);
      toast(uid ? "Learner progress exported" : "Progress exported");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
      if (!isHttpErrorToastHandled(err)) toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close admin">
          <X size={18} />
        </button>

        <header className="admin-hero">
          <div>
            <em>
              <Shield size={14} /> Admin control
            </em>
            <h2 id="admin-title">BodyAgents console</h2>
            <p>Edit quiz banks, manage accounts, and export learner progress.</p>
          </div>
        </header>

        <div className="admin-tabs" role="tablist">
          {(
            [
              ["quizzes", "Quizzes"],
              ["users", "Users"],
              ["progress", "Progress"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="admin-error">{error}</p>}

        {tab === "quizzes" && (
          <div className="admin-body">
            <div className="admin-toolbar">
              <label>
                Organ
                <select
                  value={organId}
                  onChange={(event) => selectOrgan(event.target.value as OrganId)}
                >
                  {organs.map((organ) => (
                    <option key={organ.id} value={organ.id}>
                      {organ.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-toolbar-actions">
                <button type="button" className="admin-secondary" onClick={addQuestion}>
                  <Plus size={14} /> Add question
                </button>
                <button type="button" className="admin-primary" disabled={busy || !dirty} onClick={() => void saveQuiz()}>
                  <Save size={14} /> {busy ? "Saving…" : "Save bank"}
                </button>
              </div>
            </div>

            <ul className="admin-question-list">
              {draft.map((question, index) => (
                <li key={question.id} className="admin-question-card">
                  <div className="admin-question-head">
                    <strong>Q{index + 1}</strong>
                    <input
                      value={question.id}
                      onChange={(event) => updateQuestion(index, { id: event.target.value })}
                      aria-label="Question id"
                    />
                    <button
                      type="button"
                      className="admin-icon-btn"
                      aria-label="Remove question"
                      onClick={() => removeQuestion(index)}
                      disabled={draft.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <label>
                    Prompt
                    <textarea
                      value={question.prompt}
                      rows={2}
                      onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                    />
                  </label>
                  <div className="admin-choices">
                    {question.choices.map((choice, cIndex) => (
                      <label key={cIndex} className={question.correctIndex === cIndex ? "correct" : ""}>
                        <span>
                          <input
                            type="radio"
                            name={`correct-${question.id}`}
                            checked={question.correctIndex === cIndex}
                            onChange={() =>
                              updateQuestion(index, {
                                correctIndex: cIndex as QuizQuestion["correctIndex"],
                              })
                            }
                          />{" "}
                          Choice {cIndex + 1}
                        </span>
                        <input
                          value={choice}
                          onChange={(event) => updateChoice(index, cIndex, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Explanation
                    <textarea
                      value={question.explain}
                      rows={2}
                      onChange={(event) => updateQuestion(index, { explain: event.target.value })}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "users" && (
          <div className="admin-body">
            <p className="admin-hint">
              <Users size={14} /> {users.length} accounts · disable instead of delete
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <UserRow
                      key={row.id}
                      user={row}
                      busy={busy}
                      isSelf={row.id === user.id}
                      onSave={(patch) => void onPatchUser(row, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "progress" && (
          <div className="admin-body">
            <div className="admin-toolbar">
              <p className="admin-hint">Learner quiz XP, coins, streaks, and stars</p>
              <button type="button" className="admin-primary" disabled={busy} onClick={() => void onExport()}>
                <Download size={14} /> Export all Excel
              </button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>XP</th>
                    <th>Coins</th>
                    <th>Streak</th>
                    <th>Tried</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ user: learner, progress }) => {
                    const tried = Object.keys(progress.bestScores || {}).length;
                    return (
                      <tr key={learner.id}>
                        <td>
                          <strong>{learner.name}</strong>
                          <small>{learner.email}</small>
                        </td>
                        <td>{progress.xp}</td>
                        <td>{progress.coins}</td>
                        <td>{progress.streak}</td>
                        <td>{tried}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-secondary"
                            disabled={busy}
                            onClick={() => void onExport(learner.id)}
                          >
                            <Download size={13} /> Excel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function UserRow({
  user,
  busy,
  isSelf,
  onSave,
}: {
  user: AdminUser;
  busy: boolean;
  isSelf: boolean;
  onSave: (patch: Partial<Pick<AdminUser, "name" | "email" | "role" | "active">>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
  }, [user]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ name, email, role });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <form className="admin-inline-form" onSubmit={submit}>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as AdminUser["role"])}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" className="admin-primary" disabled={busy}>
              <Save size={13} /> Save
            </button>
            <button type="button" className="admin-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={!user.active ? "inactive" : undefined}>
      <td>
        <strong>{user.name}</strong>
        {isSelf && <small>you</small>}
      </td>
      <td>{user.email}</td>
      <td>
        <span className={`admin-pill ${user.role}`}>{user.role}</span>
      </td>
      <td>{user.active ? "Active" : "Disabled"}</td>
      <td className="admin-row-actions">
        <button type="button" className="admin-icon-btn" aria-label="Edit user" onClick={() => setEditing(true)}>
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="admin-secondary"
          disabled={busy}
          onClick={() => onSave({ active: !user.active })}
        >
          {user.active ? "Disable" : "Enable"}
        </button>
      </td>
    </tr>
  );
}
