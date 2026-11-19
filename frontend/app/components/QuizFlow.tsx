"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Coins,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { Organ } from "../lib/anatomy-data";
import { quizForOrgan, QUIZ_LENGTH } from "../lib/quiz-data";
import {
  applyQuizResult,
  BADGE_META,
  type BadgeId,
  type QuizResultDelta,
} from "../lib/quiz-progress";
import { OrganArt } from "./OrganArt";

type Props = {
  organ: Organ;
  userId: string;
  onClose: () => void;
};

type Phase = "intro" | "question" | "feedback" | "results";

export function QuizFlow({ organ, userId, onClose }: Props) {
  const questions = useMemo(() => quizForOrgan(organ.id).questions, [organ.id]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<QuizResultDelta | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const question = questions[index];
  const total = questions.length || QUIZ_LENGTH;
  const progressPct = phase === "intro" ? 0 : phase === "results" ? 100 : ((index + (phase === "feedback" ? 1 : 0)) / total) * 100;

  useEffect(() => {
    if (!stageRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    gsap.fromTo(
      stageRef.current,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.42, ease: "power2.out" },
    );
  }, [phase, index]);

  if (!question && phase !== "results" && phase !== "intro") {
    return (
      <div className="quiz-flow">
        <p>No quiz questions are available for this organ yet.</p>
        <button type="button" className="lesson-button" onClick={onClose}>
          Close <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const pick = (choiceIndex: number) => {
    if (phase !== "question" || selected !== null || !question) return;
    setSelected(choiceIndex);
    if (choiceIndex === question.correctIndex) setCorrectCount((n) => n + 1);
    setPhase("feedback");
  };

  const goNext = () => {
    if (!question) return;
    if (index + 1 >= total) {
      const delta = applyQuizResult(userId, {
        organId: organ.id,
        correctCount,
        total,
      });
      setResult(delta);
      setPhase("results");
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setPhase("question");
  };

  const startQuiz = () => {
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setResult(null);
    setPhase("question");
  };

  if (phase === "intro") {
    return (
      <div
        className="quiz-flow quiz-intro"
        style={{ "--item-accent": organ.accent } as React.CSSProperties}
        ref={stageRef}
      >
        <div className="quiz-intro-art">
          <OrganArt organ={organ} asset="organ" alt={`${organ.name} illustration`} size={110} />
        </div>
        <em>Guided discovery</em>
        <h3>{organ.name} quick quiz</h3>
        <p>
          Five short questions drawn from this specimen’s lesson notes. Earn XP and coins,
          grow your streak, and unlock organ stars.
        </p>
        <ul className="quiz-intro-perks">
          <li><Sparkles size={14} /> +10 XP per correct answer</li>
          <li><Coins size={14} /> Coins + bonus for a perfect 5/5</li>
          <li><Star size={14} /> Stars based on your best score</li>
        </ul>
        <button type="button" className="lesson-button" onClick={startQuiz}>
          Start quiz <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  if (phase === "results" && result) {
    return (
      <div
        className="quiz-flow quiz-results"
        style={{ "--item-accent": organ.accent } as React.CSSProperties}
        ref={stageRef}
      >
        <div className="quiz-intro-art compact">
          <OrganArt organ={organ} asset="thumb" alt="" size={64} />
        </div>
        <em>Quiz complete</em>
        <h3>{organ.name} results</h3>
        <p className="quiz-score-line">
          You scored <strong>{correctCount}/{total}</strong>
        </p>
        <div className="quiz-stars large" aria-label={`${result.stars} stars`}>
          {([1, 2, 3] as const).map((n) => (
            <Star key={n} size={22} fill={n <= result.stars ? "currentColor" : "none"} />
          ))}
        </div>
        <div className="quiz-reward-row">
          <span><Sparkles size={14} /> +{result.xpEarned} XP</span>
          <span><Coins size={14} /> +{result.coinsEarned} coins</span>
        </div>
        {result.newBadges.length > 0 ? (
          <ul className="quiz-new-badges">
            {result.newBadges.map((id) => (
              <li key={id}>
                <b>{BADGE_META[id as BadgeId].title}</b>
                <span>{BADGE_META[id as BadgeId].detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiz-keep-going">Keep exploring organs to unlock more badges.</p>
        )}
        <div className="quiz-result-actions">
          <button type="button" className="lesson-button secondary" onClick={startQuiz}>
            Try again
          </button>
          <button type="button" className="lesson-button" onClick={onClose}>
            Continue exploring <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  const isCorrect = selected !== null && question && selected === question.correctIndex;

  return (
    <div
      className="quiz-flow quiz-play"
      style={{ "--item-accent": organ.accent } as React.CSSProperties}
    >
      <div className="quiz-track" aria-hidden>
        <i style={{ width: `${progressPct}%` }} />
      </div>
      <div className="quiz-progress-meta">
        <em>Question {index + 1} of {total}</em>
        <span className="quiz-organ-pill">
          <OrganArt organ={organ} asset="thumb" alt="" size={22} />
          {organ.name}
        </span>
      </div>

      <div className="quiz-stage" ref={stageRef} key={`${organ.id}-${index}-${phase === "feedback" ? "f" : "q"}`}>
        <div className="quiz-options">
          <p>{question?.prompt}</p>
          {question?.choices.map((choice, choiceIndex) => {
            let state = "";
            if (phase === "feedback" && selected !== null) {
              if (choiceIndex === question.correctIndex) state = "correct";
              else if (choiceIndex === selected) state = "wrong";
            }
            return (
              <button
                key={choice}
                type="button"
                className={state}
                disabled={phase !== "question"}
                onClick={() => pick(choiceIndex)}
              >
                <span className="quiz-choice-index">{String.fromCharCode(65 + choiceIndex)}</span>
                <span>{choice}</span>
              </button>
            );
          })}
        </div>

        {phase === "feedback" && question ? (
          <div className={`quiz-feedback ${isCorrect ? "ok" : "no"}`}>
            {isCorrect ? <Check size={15} /> : <X size={15} />}
            <p>
              <b>{isCorrect ? "Correct" : "Not quite"}</b>
              {question.explain}
            </p>
            <button type="button" className="quiz-next" onClick={goNext}>
              {index + 1 >= total ? "See results" : "Next question"} <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <p className="quiz-hint"><CircleHelp size={13} /> Pick the best answer to continue</p>
        )}
      </div>
    </div>
  );
}
