"use client";

import { useInViewport } from "@mantine/hooks";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./home.module.css";

/**
 * Fades a block in when it scrolls into view. The server renders it visible; the client only hides it
 * after mount when it is off-screen, so nothing is invisible without JavaScript. The global
 * reduced-motion rule zeroes the transition.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, inViewport } = useInViewport<HTMLDivElement>();
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    // Mirrors a browser-only observer (useInViewport) into state; there is no external system to
    // subscribe to beyond the hook itself, so the update belongs here, not in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => (inViewport ? "shown" : current === "shown" ? "shown" : "hidden"));
  }, [inViewport]);

  const cls = [className, state === "hidden" ? styles.revealHidden : state === "shown" ? styles.revealShown : ""].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
