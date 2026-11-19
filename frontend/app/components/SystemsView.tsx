"use client";

import { ArrowRight, BrainCircuit } from "lucide-react";
import { organsBySystem, type OrganId } from "../lib/anatomy-data";
import { OrganArt } from "./OrganArt";

type Props = {
  onSelectOrgan: (id: OrganId) => void;
};

export function SystemsView({ onSelectOrgan }: Props) {
  const groups = organsBySystem();

  return (
    <section className="workspace-view systems-view" aria-label="Body systems">
      <header className="workspace-view-hero">
        <em><BrainCircuit size={15} /> Systems map</em>
        <h1>How the body organizes itself</h1>
        <p>
          Each system is a team of organs with one shared job. Browse a system, then open any organ
          to explore it in 3D and talk with its teacher.
        </p>
      </header>

      <div className="systems-list">
        {groups.map((group) => (
          <article key={group.name} className="system-block">
            <header>
              <div>
                <em>Body system</em>
                <h2>{group.name}</h2>
              </div>
              <span className="system-count">{group.organs.length} organ{group.organs.length === 1 ? "" : "s"}</span>
            </header>
            <p>{group.summary}</p>
            <div className="system-organ-row">
              {group.organs.map((organ) => (
                <button
                  key={organ.id}
                  type="button"
                  className="system-organ-chip"
                  style={{ "--item-accent": organ.accent } as React.CSSProperties}
                  onClick={() => onSelectOrgan(organ.id)}
                >
                  <OrganArt organ={organ} asset="thumb" alt="" size={42} />
                  <span>
                    <b>{organ.name}</b>
                    <small>{organ.function}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
