"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Droplets,
  HandHeart,
  MapPin,
  Ruler,
  Scale,
  Sparkles,
  Stethoscope,
  Video,
} from "lucide-react";
import { organLessons, type OrganId } from "../lib/anatomy-data";
import { OrganArt } from "./OrganArt";

type Props = {
  focusOrganId?: OrganId;
  onSelectOrgan: (id: OrganId) => void;
  onTakeQuiz: (id: OrganId) => void;
};

export function LessonsView({ focusOrganId, onSelectOrgan, onTakeQuiz }: Props) {
  const lessons = organLessons();
  const [activeId, setActiveId] = useState<OrganId>(focusOrganId ?? lessons[0]?.organ.id ?? "heart");
  const active = lessons.find((lesson) => lesson.organ.id === activeId) ?? lessons[0];

  useEffect(() => {
    if (focusOrganId) setActiveId(focusOrganId);
  }, [focusOrganId]);

  if (!active) return null;

  const { organ } = active;
  const videoSrc = organ.lessonVideoSrc?.trim() || "";
  const conditions = organ.conditions.slice(0, 5);

  return (
    <section className="workspace-view lessons-view" aria-label="Lessons">
      <header className="workspace-view-hero">
        <em><BookOpen size={15} /> Guided lessons</em>
        <h1>Short lessons for every organ</h1>
        <p>
          Plain-language study sheets with key facts, everyday tips, common conditions to know,
          a short video, and a path into the 3D explorer.
        </p>
      </header>

      <div className="lessons-layout">
        <div className="lesson-rail" role="list">
          {lessons.map((lesson) => (
            <button
              key={lesson.organ.id}
              type="button"
              role="listitem"
              className={`lesson-rail-item ${lesson.organ.id === organ.id ? "active" : ""}`}
              style={{ "--item-accent": lesson.organ.accent } as React.CSSProperties}
              onClick={() => setActiveId(lesson.organ.id)}
            >
              <OrganArt organ={lesson.organ} asset="thumb" alt="" size={40} />
              <span>
                <b>{lesson.organ.name}</b>
                <small>
                  {lesson.organ.system}
                  {lesson.organ.lessonVideoSrc ? " · Video" : ""}
                </small>
              </span>
            </button>
          ))}
        </div>

        <article className="lesson-sheet" style={{ "--item-accent": organ.accent } as React.CSSProperties}>
          <div className="lesson-sheet-top">
            <div>
              <em>Lesson sheet · {organ.system}</em>
              <h2>{active.title}</h2>
              <small>{organ.poetic} · {organ.scientificName}</small>
            </div>
            <span className="lesson-stamp">
              <OrganArt organ={organ} asset="organ" alt={`${organ.name} illustration`} size={88} />
            </span>
          </div>

          <p className="lesson-summary">{active.summary}</p>

          <div className="lesson-plain">
            <em>In plain English</em>
            <p>{active.inPlainEnglish}</p>
          </div>

          <dl className="lesson-facts">
            <div>
              <dt><MapPin size={13} /> Where it sits</dt>
              <dd>{organ.location}</dd>
            </div>
            <div>
              <dt><Ruler size={13} /> Size</dt>
              <dd>{organ.size}</dd>
            </div>
            <div>
              <dt><Scale size={13} /> Weight</dt>
              <dd>{organ.weight}</dd>
            </div>
            <div>
              <dt><Droplets size={13} /> Every day</dt>
              <dd>{organ.dailyFact}</dd>
            </div>
          </dl>

          <div className="lesson-points">
            <div>
              <em>Main job</em>
              <p>{active.focus}</p>
              <small className="lesson-meta">Tissue: {organ.tissue} · Blood supply: {organ.bloodSupply}</small>
            </div>
            <div className="medical-note">
              <Stethoscope size={16} />
              <p><b>Why doctors care</b>{organ.medical}</p>
            </div>
            <div className="fun-note">
              <Sparkles size={15} />
              <p><b>Remember this</b>{active.takeaway}</p>
            </div>
            <div className="tip-care">
              <HandHeart size={15} />
              <p><b>Everyday tip</b>{active.everydayTip}</p>
            </div>
          </div>

          {active.parts.length > 0 ? (
            <div className="lesson-parts">
              <em>Parts to notice</em>
              <ul>
                {active.parts.map((part) => (
                  <li key={part.label}>
                    <b>{part.label}</b>
                    <span>{part.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="lesson-conditions">
            <em>Conditions worth knowing</em>
            <ul>
              {conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>

          {videoSrc ? (
            <div className="lesson-video">
              <div className="lesson-video-head">
                <em><Video size={15} /> Watch the lesson</em>
              </div>
              <div className="lesson-video-frame">
                <video
                  key={organ.id}
                  src={videoSrc}
                  title={`${organ.name} lesson video`}
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>
            </div>
          ) : null}

          <div className="lesson-actions">
            <button
              type="button"
              className="lesson-button secondary"
              onClick={() => onTakeQuiz(organ.id)}
            >
              <CircleHelp size={15} /> Take quiz
            </button>
            <button
              type="button"
              className="lesson-button"
              onClick={() => onSelectOrgan(organ.id)}
            >
              Explore {organ.name} in 3D <ArrowRight size={16} />
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
