"use client";

import type { Organ } from "../lib/anatomy-data";

type Asset = "thumb" | "organ" | "microscopic" | "compare" | "location";

/**
 * Renders an organ illustration, or its accent glyph for organs that ship as a
 * 3D model without the painted asset set.
 */
export function OrganArt({
  organ,
  asset,
  alt,
  size,
}: {
  organ: Organ;
  asset: Asset;
  alt: string;
  size?: number;
}) {
  if (!organ.illustrated) {
    const labelling = alt ? { role: "img" as const, "aria-label": alt } : { "aria-hidden": true as const };
    return (
      <span className="art-fallback" style={{ "--art-accent": organ.accent } as React.CSSProperties} {...labelling}>
        {organ.icon}
      </span>
    );
  }
  return (
    <img
      key={`${organ.id}-${asset}`}
      src={`/anatomy/${organ.id}/${asset}.webp`}
      alt={alt}
      width={size}
      height={size}
      loading={asset === "thumb" ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
