"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, LibraryBig, Video } from "lucide-react";
import { organs, organsBySystem, type OrganId } from "../lib/anatomy-data";
import { OrganArt } from "./OrganArt";

type Props = {
  query: string;
  onSelectOrgan: (id: OrganId) => void;
  onOpenLesson: (id: OrganId) => void;
};

export function LibraryView({ query, onSelectOrgan, onOpenLesson }: Props) {
  const systems = useMemo(() => organsBySystem().map((group) => group.name), []);
  const [systemFilter, setSystemFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organs.filter((organ) => {
      if (systemFilter !== "all" && organ.system !== systemFilter) return false;
      if (!needle) return true;
      return `${organ.name} ${organ.system} ${organ.description} ${organ.function} ${organ.conditions.join(" ")} ${organ.funFact}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query, systemFilter]);

  return (
    <section className="workspace-view library-view" aria-label="Organ library catalog">
      <header className="workspace-view-hero">
        <em><LibraryBig size={15} /> Specimen catalog</em>
        <h1>Browse the organ library</h1>
        <p>
          Filter by body system, skim key facts and conditions, then jump into a lesson
          or the 3D explorer.
        </p>
      </header>

      <div className="library-filters" role="toolbar" aria-label="Filter by body system">
        <button
          type="button"
          className={systemFilter === "all" ? "active" : ""}
          onClick={() => setSystemFilter("all")}
        >
          All <span>{organs.length}</span>
        </button>
        {systems.map((system) => {
          const count = organs.filter((organ) => organ.system === system).length;
          return (
            <button
              key={system}
              type="button"
              className={systemFilter === system ? "active" : ""}
              onClick={() => setSystemFilter(system)}
            >
              {system} <span>{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="workspace-empty">
          No organs match{query.trim() ? ` “${query.trim()}”` : ""}
          {systemFilter !== "all" ? ` in ${systemFilter}` : ""}. Try another filter or clear the search.
        </p>
      ) : (
        <div className="library-grid">
          {filtered.map((organ) => (
            <article
              key={organ.id}
              className="library-entry"
              style={{ "--item-accent": organ.accent } as React.CSSProperties}
            >
              <div className="library-entry-art">
                <OrganArt organ={organ} asset="organ" alt={`${organ.name} illustration`} size={120} />
              </div>
              <div className="library-entry-copy">
                <div className="library-entry-badges">
                  <em>{organ.system}</em>
                  {organ.lessonVideoSrc ? (
                    <span className="library-video-badge"><Video size={12} /> Video</span>
                  ) : null}
                </div>
                <h2>{organ.name}</h2>
                <small>{organ.scientificName} · {organ.poetic}</small>
                <p>{organ.description}</p>
                <dl>
                  <div><dt>Function</dt><dd>{organ.function}</dd></div>
                  <div><dt>Location</dt><dd>{organ.location}</dd></div>
                  <div><dt>Size</dt><dd>{organ.size}</dd></div>
                  <div><dt>Daily</dt><dd>{organ.dailyFact}</dd></div>
                </dl>
                <p className="library-fun">{organ.funFact}</p>
                <ul className="library-conditions" aria-label={`Conditions related to the ${organ.name}`}>
                  {organ.conditions.slice(0, 4).map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
                <div className="library-actions">
                  <button type="button" className="lesson-button secondary" onClick={() => onOpenLesson(organ.id)}>
                    <BookOpen size={15} /> Open lesson
                  </button>
                  <button type="button" className="lesson-button" onClick={() => onSelectOrgan(organ.id)}>
                    Open in Explore <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
