/**
 * The ECharts theme object built from the site's colour tokens (spec §3.1). Pure so it is unit-tested;
 * `usePalette` reads the values from the CSS variables and `EChart` hands the result to `echarts.init`.
 */
export interface ChartStyle {
  text: string;
  muted: string;
  rule: string;
  surface: string;
  accent: string;
  palette: string[];
  unknown: string;
  /** The resolved body font family: next/font renames families, so it is read at runtime. */
  font: string;
  /** false under prefers-reduced-motion. */
  motion: boolean;
  /** The scheme the values above were read in; part of the style so one object describes one theme. */
  scheme: "light" | "dark";
}

/** Value equality over every field, so a re-read that changed nothing keeps the previous object. */
export function sameStyle(a: ChartStyle, b: ChartStyle): boolean {
  return (
    a.text === b.text &&
    a.muted === b.muted &&
    a.rule === b.rule &&
    a.surface === b.surface &&
    a.accent === b.accent &&
    a.unknown === b.unknown &&
    a.font === b.font &&
    a.motion === b.motion &&
    a.scheme === b.scheme &&
    a.palette.length === b.palette.length &&
    a.palette.every((c, i) => c === b.palette[i])
  );
}

/** What the server renders with before the browser can read the variables; the light tokens. */
export const SERVER_STYLE: ChartStyle = {
  text: "#1e1b17",
  muted: "#6a635a",
  rule: "#e2dccf",
  surface: "#fffdf8",
  accent: "#9a4a2e",
  palette: ["#2f5d7c", "#2f6f6a", "#4e7440", "#8a7522", "#9a5a26", "#8e3f3a", "#7c4470", "#4d4f8c"],
  unknown: "#8b8b85",
  font: "system-ui, sans-serif",
  motion: false,
  scheme: "light",
};

/**
 * Vertical space every chart reserves between its title and its content, in pixels: `grid.top` for
 * bar/histogram, and the series' own box `top` for pie and map/choropleth (title fontSize 15, weight
 * 600 — one line plus breathing room). Shared so the gap reads the same across chart kinds and sizes,
 * checked at 1280px and 390px in both themes rather than three separate magic numbers.
 *
 * This is measured from the container's own y = 0, not from the card's edge — the card's own padding
 * (`.chapterChart`/`.card`/`.cardWide`/`.mapCard`, all 1rem) sits above that and is not this constant's
 * concern. It IS tied to `chartTheme`'s own `title.top: 0` below: ECharts' title component defaults to
 * `top: 15` (its own built-in breathing room) when nothing overrides it, which stacked with the card
 * padding to read as too much air above the title (2026-09-18 review). Pinning `title.top` to 0 removes
 * exactly that 15px above the title; this constant is reduced by the same 15px so the band below the
 * title — the part this constant actually controls — stays the same ~14px it was tuned to before.
 * Change one, change the other by the same amount, or the two gaps stop matching what was reviewed.
 */
export const CHART_TITLE_GAP = 43;

export function chartTheme(style: ChartStyle): Record<string, unknown> {
  const axis = {
    axisLine: { lineStyle: { color: style.rule } },
    axisTick: { lineStyle: { color: style.rule } },
    axisLabel: { color: style.muted },
    splitLine: { lineStyle: { color: style.rule } },
  };
  return {
    color: style.palette,
    backgroundColor: "transparent",
    animation: style.motion,
    textStyle: { color: style.text, fontFamily: style.font },
    // `top: 0` overrides ECharts' own default (15px, see CHART_TITLE_GAP's comment above) — this is
    // the single place that pins every chart kind's title to the same distance from its own container.
    title: { top: 0, textStyle: { color: style.text, fontWeight: 600, fontSize: 15 } },
    categoryAxis: axis,
    valueAxis: axis,
    legend: { textStyle: { color: style.muted } },
    visualMap: { textStyle: { color: style.muted } },
    tooltip: {
      backgroundColor: style.surface,
      borderColor: style.rule,
      textStyle: { color: style.text },
      // `EChart.module.css`'s `.chart` clips with `overflow: hidden` (deliberately — it stops a
      // not-yet-resized chart from widening its grid column) and ECharts renders the tooltip inside
      // that same element by default, so a tooltip near the container's own edge got sliced by the
      // clip (2026-09-18 review: "ссылка, спецпоселение" cut off at the left edge). `appendTo: "body"`
      // (the current, non-deprecated option — `appendToBody` still exists but its own doc says to use
      // this instead, checked in node_modules/echarts/types/dist/echarts.d.ts) renders the tooltip as
      // its own element on `document.body` instead, so it is never clipped by any chart's own box.
      // Set once here rather than per chart builder, so every chart (bar, pie, histogram, map) gets it.
      appendTo: "body",
      // `appendTo: "body"` alone stops the local clip but not overflow off the actual browser window:
      // ECharts' own confine math (TooltipView.js) measures against the chart instance's own width/
      // height, not the viewport, so it keeps the tooltip from starting left of the chart's own left
      // edge (or right of its right edge) without ever shrinking or re-clipping it — content that's
      // wider than the chart itself is then free to spill onto the page to whichever side has room,
      // which on a real page (unlike the chart's own narrow box) it does. Checked at 390px, where a
      // narrow chart sits close to the actual window edge: without this the tooltip could still start
      // at a negative page coordinate (off the left of the browser window itself).
      confine: true,
    },
  };
}
