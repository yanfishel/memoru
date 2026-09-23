"use client";

import { useInViewport, useReducedMotion } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { formatInt } from "@/lib/format";

const DURATION_MS = 900;

/**
 * Renders the final number on the server; once the element enters the viewport the client counts
 * from 0 to the value, once. Under reduced motion the number never moves.
 */
export function CountUp({ value, testId }: { value: number; testId?: string }) {
  const { ref, inViewport } = useInViewport<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (!inViewport || started.current || reduced) return;
    started.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // If the card leaves the viewport mid-count, `inViewport` flips to false and this effect
    // re-runs: the cleanup must snap to the real value, or an interrupted animation freezes on
    // whatever interpolated number it reached, and `started.current` blocks a restart.
    return () => {
      cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [inViewport, reduced, value]);

  return (
    <span ref={ref} className="tnum" data-testid={testId}>
      {formatInt(shown)}
    </span>
  );
}
