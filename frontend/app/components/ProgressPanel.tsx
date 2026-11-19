"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Coins, Flame, Sparkles, Star, Trophy, X } from "lucide-react";
import { organs } from "../lib/anatomy-data";
import { useAuth } from "../lib/auth-context";
import {
  BADGE_META,
  loadProgress,
  subscribeQuizProgress,
  type BadgeId,
  type QuizProgress,
} from "../lib/quiz-progress";
import { OrganArt } from "./OrganArt";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ProgressPanel({ open, onClose }: Props) {
  const { user, requireAuth } = useAuth();
  const [progress, setProgress] = useState<QuizProgress | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!user) {
      requireAuth();
      onClose();
      return;
    }
    const refresh = () => setProgress(loadProgress(user.id));
    refresh();
    const unsub = subscribeQuizProgress(refresh);
    window.addEventListener("bodyagents:auth-logout", onClose);
    return () => {
      unsub();
      window.removeEventListener("bodyagents:auth-logout", onClose);
    };
  }, [open, user, requireAuth, onClose]);

  const mastery = useMemo(() => {
    if (!progress) return { starred: 0, perfect: 0, tried: 0 };
    let starred = 0;
    let perfect = 0;
    let tried = 0;
    for (const organ of organs) {
      const stars = progress.organStars[organ.id] ?? 0;
      const best = progress.bestScores[organ.id];
      if (best != null) tried += 1;
      if (stars >= 1) starred += 1;
      if (stars >= 3) perfect += 1;
    }
    return { starred, perfect, tried };
  }, [progress]);

  if (!open || !user || !progress) return null;

  const allBadges = Object.keys(BADGE_META) as BadgeId[];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="progress-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close progress">
          <X size={18} />
        </button>

        <header className="progress-hero">
          <div className="progress-hero-copy">
            <em><Trophy size={14} /> Study progress · {user.name}</em>
            <h2 id="progress-title">Your quiz journey</h2>
            <p>
              {mastery.tried === 0
                ? "Take your first organ quiz to start collecting XP, coins, and stars."
                : `You’ve tried ${mastery.tried} organ${mastery.tried === 1 ? "" : "s"} · ${mastery.starred} starred · ${mastery.perfect} perfect.`}
            </p>
          </div>
          <div className="progress-hero-orb" aria-hidden>
            <Sparkles size={28} />
          </div>
        </header>

        <div className="progress-stat-row">
          <div className="xp"><Sparkles size={16} /><b>{progress.xp}</b><span>XP</span></div>
          <div className="coins"><Coins size={16} /><b>{progress.coins}</b><span>Coins</span></div>
          <div className="streak"><Flame size={16} /><b>{progress.streak}</b><span>Day streak</span></div>
        </div>

        <div className="progress-section">
          <em>Organ mastery</em>
          <ul className="progress-organ-grid">
            {organs.map((organ) => {
              const stars = progress.organStars[organ.id] ?? 0;
              const best = progress.bestScores[organ.id];
              return (
                <li
                  key={organ.id}
                  style={{ "--item-accent": organ.accent } as React.CSSProperties}
                  className={stars > 0 ? "earned" : ""}
                >
                  <span className="progress-organ-thumb">
                    <OrganArt organ={organ} asset="thumb" alt="" size={40} />
                  </span>
                  <span className="progress-organ-copy">
                    <b>{organ.name}</b>
                    <small>{best != null ? `Best ${best}/5` : "Not tried yet"}</small>
                  </span>
                  <span className="quiz-stars" aria-label={`${stars} stars`}>
                    {([1, 2, 3] as const).map((n) => (
                      <Star key={n} size={12} fill={n <= stars ? "currentColor" : "none"} />
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="progress-section">
          <em>Badges</em>
          <ul className="progress-badge-grid">
            {allBadges.map((id) => {
              const unlocked = progress.badges.includes(id);
              return (
                <li key={id} className={unlocked ? "unlocked" : "locked"}>
                  <span className="progress-badge-icon"><Award size={16} /></span>
                  <div>
                    <b>{BADGE_META[id].title}</b>
                    <span>{BADGE_META[id].detail}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

type ChipProps = {
  onOpen: () => void;
};

export function ProgressChip({ onOpen }: ChipProps) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<QuizProgress | null>(null);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      return;
    }
    const refresh = () => setProgress(loadProgress(user.id));
    refresh();
    return subscribeQuizProgress(refresh);
  }, [user]);

  if (!user || !progress) return null;

  return (
    <button type="button" className="progress-chip" onClick={onOpen} aria-label="Open quiz progress">
      <span><Coins size={14} /> {progress.coins}</span>
      <span><Sparkles size={14} /> {progress.xp}</span>
      <span><Flame size={14} /> {progress.streak}</span>
    </button>
  );
}
