"use client";

import { useEffect, useRef } from "react";

/**
 * A short, silent, looping video that plays only while it is on screen.
 *
 * No controls, no sound, a poster until the first frame, and it pauses when
 * scrolled away so several on one page cost nothing off screen. `webm` first
 * for size, `mp4` for Safari. Drop the files into /public/loops and point at
 * them; the component does the rest.
 */
export function Loop({
  mp4,
  webm,
  poster,
  className = "",
  label,
}: {
  mp4: string;
  webm?: string;
  poster?: string;
  className?: string;
  /** What the clip shows, for people who cannot see it. */
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      aria-label={label}
      className={`block h-full w-full object-cover ${className}`}
    >
      {webm && <source src={webm} type="video/webm" />}
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
