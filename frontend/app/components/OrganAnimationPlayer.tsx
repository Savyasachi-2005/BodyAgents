"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import type { Organ } from "../lib/anatomy-data";
import { organAnimationSrc } from "../lib/anatomy-data";

type Props = {
  organ: Organ;
};

/**
 * Portrait (9:16) organ function clip. Starts with sound when the browser allows;
 * if autoplay-with-sound is blocked, plays muted and offers one tap to unmute.
 */
export function OrganAnimationPlayer({ organ }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setNeedsUnmute(false);
    video.loop = true;
    video.muted = false;
    video.currentTime = 0;

    const start = async () => {
      try {
        await video.play();
        if (!cancelled) setNeedsUnmute(false);
      } catch {
        if (cancelled) return;
        // Browsers often block unmuted autoplay — keep looping, then let the user unmute.
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* ignore */
        }
        if (!cancelled) setNeedsUnmute(true);
      }
    };

    void start();
    return () => {
      cancelled = true;
      video.pause();
    };
  }, [organ.id]);

  const unmute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    void video.play().catch(() => {});
    setNeedsUnmute(false);
  };

  return (
    <div className="animation-modal-frame">
      <video
        ref={videoRef}
        key={organ.id}
        className="animation-modal-video"
        playsInline
        preload="auto"
        poster={organ.illustrated ? `/anatomy/${organ.id}/organ.webp` : undefined}
      >
        <source src={organAnimationSrc(organ.id)} type="video/mp4" />
        Your browser does not support embedded video.
      </video>
      {needsUnmute ? (
        <button type="button" className="animation-unmute" onClick={unmute}>
          <Volume2 size={18} /> Tap for sound
        </button>
      ) : null}
    </div>
  );
}
