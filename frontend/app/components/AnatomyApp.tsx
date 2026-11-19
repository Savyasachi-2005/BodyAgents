"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  BrainCircuit,
  ChevronDown,
  CircleHelp,
  Compass,
  FileText,
  Heart,
  LibraryBig,
  Microscope,
  NotebookPen,
  Play,
  Search,
  Share2,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { OrganViewer } from "./OrganViewer";
import { ChatPanel } from "./ChatPanel";
import { AuthMenu } from "./AuthMenu";
import { NotesPanel } from "./NotesPanel";
import { ProgressChip, ProgressPanel } from "./ProgressPanel";
import { QuizFlow } from "./QuizFlow";
import { OrganAnimationPlayer } from "./OrganAnimationPlayer";
import { OrganArt } from "./OrganArt";
import { SystemsView } from "./SystemsView";
import { LessonsView } from "./LessonsView";
import { LibraryView } from "./LibraryView";
import { organById, organs, type Organ, type OrganId } from "../lib/anatomy-data";
import { personaForOrgan } from "../lib/personas";
import { useAuth } from "../lib/auth-context";

type Modal = "lesson" | "quiz" | "animation" | "system" | null;
type WorkspaceView = "explore" | "systems" | "lessons" | "library";

export function AnatomyApp() {
  const { user, requireAuth } = useAuth();
  const [organId, setOrganId] = useState<OrganId>("heart");
  const [activeView, setActiveView] = useState<WorkspaceView>("explore");
  const [lessonFocusId, setLessonFocusId] = useState<OrganId>("heart");
  const [autoRotate, setAutoRotate] = useState(true);
  const [compare, setCompare] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prefetched = useRef(new Set<OrganId>());
  const organ = organById[organId];
  const reference = organById[organId === "heart" ? "brain" : "heart"];
  const filteredOrgans = useMemo(
    () => organs.filter((item) => `${item.name} ${item.system}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const exploring = activeView === "explore";

  useEffect(() => {
    if (!contentRef.current) return;
    gsap.fromTo(contentRef.current.querySelectorAll("[data-reveal]"),
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.48, stagger: 0.035, ease: "power2.out", overwrite: true },
    );
  }, [organId]);

  useEffect(() => {
    const onLogout = () => {
      setNotesOpen(false);
      setProgressOpen(false);
      setModal((current) => (current === "quiz" ? null : current));
    };
    window.addEventListener("bodyagents:auth-logout", onLogout);
    return () => window.removeEventListener("bodyagents:auth-logout", onLogout);
  }, []);

  const openNotes = () => {
    if (!requireAuth()) return;
    setNotesOpen(true);
  };

  const openQuiz = (id: OrganId = organId) => {
    if (!requireAuth()) return;
    setOrganId(id);
    setModal("quiz");
  };

  const openProgress = () => {
    if (!requireAuth()) return;
    setProgressOpen(true);
  };

  const selectOrgan = (id: OrganId) => {
    if (organById[id].illustrated) {
      ["organ", "microscopic", "compare", "location"].forEach((asset) => {
        const image = new Image();
        image.src = `/anatomy/${id}/${asset}.webp`;
      });
    }
    setOrganId(id);
    setActiveView("explore");
    setMobileLibrary(false);
    setCompare(false);
  };

  const goHome = () => {
    selectOrgan("heart");
    setActiveView("explore");
  };

  const openLesson = (id: OrganId) => {
    setLessonFocusId(id);
    setOrganId(id);
    setActiveView("lessons");
    setMobileLibrary(false);
  };

  // Warms the model in the HTTP cache while the pointer is still travelling,
  // so the switch usually renders without a visible loading pass.
  const prefetchOrgan = (id: OrganId) => {
    if (id === organId || prefetched.current.has(id)) return;
    prefetched.current.add(id);
    void fetch(organById[id].model, { priority: "low" } as RequestInit).catch(() => {});
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={goHome} aria-label="BodyAgents home">
          <strong>BodyAgents<sup>✦</sup></strong>
          <em>Talk to body-part teachers</em>
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          <button type="button" className={activeView === "explore" ? "active" : ""} onClick={() => setActiveView("explore")}>
            <Compass size={17} /> Explore
          </button>
          <button type="button" className={activeView === "systems" ? "active" : ""} onClick={() => setActiveView("systems")}>
            <BrainCircuit size={17} /> Systems
          </button>
          <button type="button" className={activeView === "lessons" ? "active" : ""} onClick={() => setActiveView("lessons")}>
            <BookOpen size={17} /> Lessons
          </button>
          <button type="button" className={activeView === "library" ? "active" : ""} onClick={() => setActiveView("library")}>
            <LibraryBig size={17} /> Library
          </button>
          <button type="button" className={notesOpen ? "active" : ""} onClick={openNotes}>
            <NotebookPen size={17} /> Notes
          </button>
        </nav>
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organs, topics…" />
        </label>
        <ProgressChip onOpen={openProgress} />
        <AuthMenu />
        <button className="mobile-library-trigger" onClick={() => setMobileLibrary(true)} aria-label="Open organ library"><LibraryBig size={20} /></button>
      </header>

      {exploring ? (
        <>
          <div className="workspace">
            <aside className={`organ-library ${mobileLibrary ? "open" : ""}`}>
              <div className="panel-heading">
                <span>Organ library</span>
                <button aria-label="Close library" className="mobile-close" onClick={() => setMobileLibrary(false)}><X size={17} /></button>
                <button aria-label="Saved organs"><Bookmark size={17} /></button>
              </div>
              <div className="organ-list">
                {filteredOrgans.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`organ-item ${organId === item.id ? "active" : ""}`}
                    onClick={() => selectOrgan(item.id)}
                    onPointerEnter={() => prefetchOrgan(item.id)}
                    onFocus={() => prefetchOrgan(item.id)}
                    style={{ "--item-accent": item.accent } as React.CSSProperties}
                  >
                    <span className="organ-glyph">
                      <OrganArt organ={item} asset="thumb" alt={`${item.name} thumbnail`} size={47} />
                    </span>
                    <span><b>{item.name}</b><small>{item.system}</small></span>
                    {organId === item.id && <Heart className="favorite" size={14} fill="currentColor" />}
                  </button>
                ))}
              </div>
              <button className="view-all" onClick={() => { setQuery(""); setActiveView("library"); }}>
                View all organs <ArrowRight size={14} />
              </button>
              <blockquote>
                <Sparkles size={18} />
                <p>Learning is<br />an act of curiosity.</p>
                <em>Keep exploring!</em>
              </blockquote>
            </aside>

            <OrganViewer
              organ={organ}
              autoRotate={autoRotate}
              onAutoRotate={setAutoRotate}
              compare={compare}
              onCompare={() => setCompare(!compare)}
            />

            <aside className="info-panel" ref={contentRef}>
              <div className="info-kicker" data-reveal><Heart size={13} fill="currentColor" /> The {organ.name}</div>
              <div className="info-title-row" data-reveal>
                <div><h1>{organ.name}</h1><em>{organ.poetic}</em></div>
                <span className="specimen-stamp">
                  <OrganArt organ={organ} asset="organ" alt={`${organ.name} anatomical illustration`} size={92} />
                </span>
              </div>
              <p className="description" data-reveal>{organ.description}</p>
              <div className="rule" />
              <h2 data-reveal>Key facts</h2>
              <dl className="key-facts">
                <div data-reveal><dt><span>◇</span> Size</dt><dd>{organ.size}</dd></div>
                <div data-reveal><dt><span>♙</span> Weight</dt><dd>{organ.weight}</dd></div>
                <div data-reveal><dt><span>⌁</span> Daily</dt><dd>{organ.dailyFact}</dd></div>
                <div data-reveal><dt><span>⌖</span> Location</dt><dd>{organ.location}</dd></div>
                <div data-reveal><dt><span>❋</span> Blood supply</dt><dd>{organ.bloodSupply}</dd></div>
                <div data-reveal><dt><span>◈</span> Function</dt><dd>{organ.function}</dd></div>
              </dl>
              <div className="medical-note" data-reveal><Stethoscope size={16} /><p><b>Medical importance</b>{organ.medical}</p></div>
              <div className="fun-note" data-reveal><Sparkles size={15} /><p><b>Did you know</b>{organ.funFact}</p></div>
              <button className="lesson-button" data-reveal onClick={() => setModal("lesson")}>View lesson <ArrowRight size={16} /></button>
              <div className="action-grid" data-reveal>
                <button onClick={() => setModal("animation")}><Play size={15} /> Animate</button>
                <button onClick={() => openQuiz(organId)}><CircleHelp size={15} /> Quiz</button>
                <button onClick={() => setCompare(!compare)} className={compare ? "active" : ""}><Share2 size={15} /> Compare</button>
              </div>
              <div data-reveal>
                <ChatPanel
                  key={personaForOrgan(organId)}
                  philosopherId={personaForOrgan(organId)}
                  onOpenNotes={openNotes}
                />
              </div>
            </aside>
          </div>

          {compare && (
            <section className="compare-strip" aria-label="Organ comparison">
              <div className="compare-organ"><OrganArt organ={organ} asset="thumb" alt="" /><span>Comparing</span><strong>{organ.name}</strong><small>{organ.system}</small></div>
              <b>vs.</b>
              <div className="compare-organ"><OrganArt organ={reference} asset="thumb" alt="" /><span>Reference</span><strong>{reference.name}</strong><small>{reference.system}</small></div>
              <dl><div><dt>Primary role</dt><dd>{organ.function}</dd></div><div><dt>Scale</dt><dd>{organ.size}</dd></div></dl>
              <button onClick={() => setCompare(false)} aria-label="Close comparison"><X size={16} /></button>
            </section>
          )}

          <section className="learning-cards" aria-label={`${organ.name} learning resources`}>
            <article className="curiosity-card">
              <span>✿</span><p>Learning is<br />an act of curiosity.</p><em>Keep exploring!</em>
            </article>
            <article>
              <header><div><em>Microscopic view</em><h3>{organ.tissue}</h3></div><Microscope size={17} /></header>
              <div className="microscope-visual organ-card-image"><OrganArt organ={organ} asset="microscopic" alt={`${organ.name} microscopic tissue view`} /></div>
              <button onClick={() => setModal("lesson")}>Explore tissue <ArrowRight size={14} /></button>
            </article>
            <article>
              <header><div><em>Compare organs</em><h3>{organ.comparison}</h3></div><Share2 size={17} /></header>
              <div className="comparison-visual organ-card-image"><OrganArt organ={organ} asset="compare" alt={`${organ.comparison} anatomical comparison`} /></div>
              <button onClick={() => setCompare(true)}>Open comparison <ArrowRight size={14} /></button>
            </article>
            <article>
              <header><div><em>Function animation</em><h3>{organ.function}</h3></div><Play size={17} /></header>
              <button
                type="button"
                className="function-visual organ-card-image"
                onClick={() => setModal("animation")}
                aria-label={`Play the ${organ.name.toLowerCase()} function animation`}
              >
                <OrganArt organ={organ} asset="organ" alt="" />
                <i className="function-pulse" />
                <span className="play-badge"><Play size={18} fill="currentColor" /></span>
              </button>
              <button onClick={() => setModal("animation")}>Play animation <ArrowRight size={14} /></button>
            </article>
            <article>
              <header><div><em>Clinical notes</em><h3>Common conditions</h3></div><FileText size={17} /></header>
              <ul>{organ.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
              <button onClick={() => setModal("lesson")}>See all <ArrowRight size={14} /></button>
            </article>
            <article className="system-card">
              <header><div><em>Where it works</em><h3>{organ.system}</h3></div><BrainCircuit size={17} /></header>
              <button
                type="button"
                className="system-visual organ-card-image"
                onClick={() => setModal("system")}
                aria-label={`See where the ${organ.name.toLowerCase()} sits in the body`}
              >
                <OrganArt organ={organ} asset="location" alt="" />
              </button>
              <button onClick={() => setModal("system")}>See the system <ArrowRight size={14} /></button>
            </article>
          </section>
        </>
      ) : (
        <div className="workspace-alt">
          {activeView === "systems" && <SystemsView onSelectOrgan={selectOrgan} />}
          {activeView === "lessons" && (
            <LessonsView
              focusOrganId={lessonFocusId}
              onSelectOrgan={selectOrgan}
              onTakeQuiz={openQuiz}
            />
          )}
          {activeView === "library" && (
            <LibraryView query={query} onSelectOrgan={selectOrgan} onOpenLesson={openLesson} />
          )}
        </div>
      )}

      {modal && (
        <LearningModal
          type={modal}
          organ={organ}
          userId={user?.id}
          onClose={() => setModal(null)}
        />
      )}
      <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} />
      <ProgressPanel open={progressOpen} onClose={() => setProgressOpen(false)} />
      {mobileLibrary && <button className="drawer-backdrop" aria-label="Close library" onClick={() => setMobileLibrary(false)} />}
    </main>
  );
}

const MODAL_ICON: Record<Exclude<Modal, null>, string> = {
  quiz: "?",
  animation: "▶",
  system: "⌖",
  lesson: "✦",
};

function LearningModal({
  type,
  organ,
  userId,
  onClose,
}: {
  type: Exclude<Modal, null>;
  organ: Organ;
  userId?: string;
  onClose: () => void;
}) {
  const organName = organ.name;
  const title =
    type === "quiz" ? `${organName} quick quiz`
    : type === "animation" ? `${organName} in motion`
    // Avoids gluing onto `system`, whose wording varies per organ
    // ("Cardiovascular" vs "Nervous System"), and stays grammatical for the
    // plural organs too.
    : type === "system" ? `${organName} in the body`
    : `Inside the ${organName.toLowerCase()}`;
  if (type === "animation") {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section
          className="animation-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${organName} in motion`}
          style={{ "--item-accent": organ.accent } as React.CSSProperties}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button className="modal-close" onClick={onClose} aria-label="Close animation"><X size={18} /></button>
          <OrganAnimationPlayer organ={organ} />
          <p className="animation-modal-caption">{organName} in motion · {organ.function}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`learning-modal ${type === "system" || type === "quiz" ? "wide" : ""} ${type === "quiz" ? "quiz-shell" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={type === "quiz" ? undefined : "modal-title"}
        aria-label={type === "quiz" ? `${organName} quick quiz` : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {type !== "quiz" ? (
          <>
            <span className="modal-icon">{MODAL_ICON[type]}</span>
            <em>Guided discovery</em>
            <h2 id="modal-title">{title}</h2>
          </>
        ) : null}
        {type === "quiz" ? (
          userId ? (
            <QuizFlow key={organ.id} organ={organ} userId={userId} onClose={onClose} />
          ) : (
            <p>Sign in to take quizzes and save your XP, coins, and streaks.</p>
          )
        ) : type === "system" ? (
          <>
            <p>{organ.location}. Trace how the {organName.toLowerCase()} connects to the rest of the body.</p>
            {/* Shown whole rather than cropped into the circular demo — the
                point of this view is the figure and its vessels. */}
            <figure className="modal-figure">
              <OrganArt organ={organ} asset="location" alt={`${organName} shown in place within the ${organ.system.toLowerCase()}`} />
            </figure>
            <dl className="modal-facts">
              <div><dt>System</dt><dd>{organ.system}</dd></div>
              <div><dt>Primary role</dt><dd>{organ.function}</dd></div>
              <div><dt>Blood supply</dt><dd>{organ.bloodSupply}</dd></div>
            </dl>
            <button className="lesson-button" onClick={onClose}>Continue exploring <ArrowRight size={16} /></button>
          </>
        ) : (
          <>
            <p>Follow the highlighted structures, rotate the specimen, and connect form with function. This short study moment is designed to build a durable mental model.</p>
            <div className="modal-demo"><OrganArt organ={organ} asset="organ" alt={`${organName} illustration`} /></div>
            <button className="lesson-button" onClick={onClose}>Continue exploring <ArrowRight size={16} /></button>
          </>
        )}
      </section>
    </div>
  );
}
