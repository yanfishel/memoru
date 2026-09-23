"use client";

import { useComputedColorScheme } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { sameStyle, SERVER_STYLE, type ChartStyle } from "@/lib/chart-theme";

/** Reads the tokens the resolver put on :root, plus the resolved body font, at call time. */
export function readChartStyle(motion: boolean): Omit<ChartStyle, "scheme"> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const palette = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--viz-${i}`)).filter(Boolean);
  return {
    text: v("--ink"),
    muted: v("--muted"),
    rule: v("--rule"),
    surface: v("--surface"),
    accent: v("--accent"),
    palette: palette.length ? palette : SERVER_STYLE.palette,
    unknown: v("--viz-unknown") || SERVER_STYLE.unknown,
    font: getComputedStyle(document.body).fontFamily || SERVER_STYLE.font,
    motion,
  };
}

/** Whatever Mantine has already written on the root element, which is what the tokens above came from. */
function documentScheme(): "light" | "dark" {
  const attr = document.documentElement.dataset.mantineColorScheme;
  return attr === "dark" || attr === "light" ? attr : "light";
}

/**
 * The chart style for the current colour scheme. The server (and the first client render) use the
 * light tokens so hydration matches; the effect re-reads the variables after mount and again every
 * time Mantine switches the scheme or the motion preference flips.
 *
 * The effect is the single source of the object's identity: the scheme is read from the DOM
 * attribute Mantine has already updated, never from the hook's render-time value, so a new object
 * appears only once — after the CSS variables are the new scheme's. `useComputedColorScheme` and
 * `useReducedMotion` are here purely as the triggers that make the effect re-run.
 */
export function usePalette(): ChartStyle {
  const scheme = useComputedColorScheme("light");
  const reduced = useReducedMotion();
  const [style, setStyle] = useState<ChartStyle>(SERVER_STYLE);
  useEffect(() => {
    // Reads external state (CSS custom properties, computed font, the root scheme attribute) that only
    // exists once mounted in the browser — not a derivable value, so it cannot move into render or a memo.
    const next: ChartStyle = { ...readChartStyle(!reduced), scheme: documentScheme() };
    // `prev !== SERVER_STYLE` keeps the "not read yet" sentinel honest: the first real read always
    // replaces the placeholder object, even in the (impossible in practice, the fonts differ) case
    // where every value happens to match. Afterwards an unchanged re-read keeps the object, so EChart
    // does not dispose and re-create the chart for nothing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStyle((prev) => (prev !== SERVER_STYLE && sameStyle(prev, next) ? prev : next));
  }, [scheme, reduced]);
  // Returned as-is: while it is still the `SERVER_STYLE` object itself (identity, not just equal values)
  // EChart can tell "not read yet" from "read, and it happens to be the light scheme" and skip its
  // first, wasted chart init.
  return style;
}
