"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean that turns on when you call `flash()` and turns itself off after
 * `ms`. It is how a button shows "Added" for a moment and then goes back to
 * "Add to cart": the success face is a flash, not a state the user has to
 * dismiss.
 *
 * Calling it again while on restarts the timer, so rapid clicks keep the tick
 * up rather than flickering it.
 */
export function useFlash(ms = 1600): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);

  return [on, flash];
}
