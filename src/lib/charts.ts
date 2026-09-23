import type { EChartsOption } from "echarts";
import type { LabelMap } from "@/db/queries";
import { CHART_TITLE_GAP } from "./chart-theme";
import type { Dimension } from "./dimensions";
import { formatInt, formatPercent, formatShareWords } from "./format";
import { UI } from "./ui-text";

export interface Slice {
  key: string;
  label: string;
  count: number;
  unknown: boolean;
  /** No records under the current filter: drawn as a dimmed label with no bar, so the chart keeps
   * its height instead of losing a row every time a filter narrows the data. */
  empty?: boolean;
  /** Present only on a merged «неизвестно» slice (`mergeUnknown`): every underlying code this one
   * slice folds together, so a filter checkbox built from it can select or deselect all of them at
   * once and count as checked when the URL carries just one (DimensionEditor.tsx's `isSliceChecked`/
   * `toggleSlice`, in explore-state.ts). Absent on every other slice — a plain slice is just its own
   * `key`. */
  codes?: string[];
}

/** The two dictionary codes every dimension folds together as one «неизвестно»: no value in the source
 * ("unknown") and a value the ETL could not place in the dictionary ("unrecognized"). Shared by the pie's
 * `mergeUnknown` display mode and the filter panel/chip's own merge (filter-chips.ts). */
export const UNKNOWN_KEYS = new Set(["unknown", "unrecognized"]);

/** How many records a dimension's facet rows leave without a value: the "unknown" and "unrecognized"
 * codes folded together, the same pair every chart treats as one «неизвестно». */
export function unknownCount(rows: Array<{ key: string; count: number }>): number {
  return rows.filter((r) => UNKNOWN_KEYS.has(r.key)).reduce((sum, r) => sum + r.count, 0);
}
const CAVEAT_BELOW = 0.9;
/** The key of the pie's merged unknown/unrecognized slice (spec §1 addendum) — distinct from either
    source key, and from `other_rest`, so it never collides with a real dictionary code. */
const MERGED_UNKNOWN_KEY = "unknown_merged";
/** Height reserved at the bottom of a pie chart's box for its horizontal legend (§1, redrawn in the
    round-2 fix): the legend carries the slice name and its share below the donut — laid out
    horizontally, side by side, rather than stacked in a column beside it — instead of the pie needing
    a column of its own next to "Приговор" in the "Приговоры" pair. Per-slice labels stay off (this is
    what removes the truncation and the crossing leader lines at 292px — see `pieOption` below).
    ECharts wraps the row onto a second line on its own once a container is too narrow for every item on
    one line — that's expected and fine (maintainer review), not something fought with a smaller font or
    a narrower donut — so this reserves two lines' worth of height rather than one, wide enough to cover
    the pair's own narrow "Пол" column, where it wraps most of the time. */
export const PIE_LEGEND_HEIGHT = 52;

function labelFor(dimension: Dimension, key: string, labels: LabelMap): { label: string; sortOrder: number } {
  if (key === "unknown") return { label: UI.notStated, sortOrder: 90 };
  if (key === "unrecognized") return { label: UI.unrecognized, sortOrder: 91 };
  const found = dimension.labelField ? labels.get(dimension.labelField)?.get(key) : undefined;
  return found ? { label: found.labelRu, sortOrder: found.sortOrder } : { label: key, sortOrder: 50 };
}

export function slicesFor(
  dimension: Dimension,
  rows: Array<{ key: string; count: number }>,
  labels: LabelMap,
  options: { top?: number; dropUnknown?: boolean; mergeUnknown?: boolean } = {},
): { slices: Slice[]; knownShare: number; caveat: string | null } {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const known = rows
    .filter((r) => !UNKNOWN_KEYS.has(r.key))
    .map((r) => ({ ...r, ...labelFor(dimension, r.key, labels) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || b.count - a.count || a.label.localeCompare(b.label, "ru"));
  const unknown = rows.filter((r) => UNKNOWN_KEYS.has(r.key)).sort((a, b) => a.key.localeCompare(b.key));
  const knownTotal = known.reduce((sum, r) => sum + r.count, 0);

  // `top` folds everything past the cut into one slice, so the survivors have to be the largest values:
  // ranking by sortOrder would hide a big value behind a small one that happens to sort earlier.
  const ranked =
    options.top === undefined
      ? known
      : [...known].sort((a, b) => b.count - a.count || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ru"));
  const kept = options.top !== undefined ? ranked.slice(0, options.top) : ranked;
  const rest = options.top !== undefined ? ranked.slice(options.top) : [];
  const slices: Slice[] = kept.map((r) => ({ key: r.key, label: r.label, count: r.count, unknown: false, empty: r.count === 0 }));
  if (rest.length) {
    slices.push({ key: "other_rest", label: UI.chart.otherRest, count: rest.reduce((s, r) => s + r.count, 0), unknown: false });
  }
  // Three behaviours for the unknown/unrecognized rows, chosen per call site (never a dimension-wide
  // default) so this one helper cannot silently change a chart nobody asked to change:
  //  - default: each kept as its own slice, as before (bar/histogram charts that are not the home
  //    sentence chart, and the filter panel's own facetSlices call, which needs every code checkable).
  //  - dropUnknown (bar chart, §4): omitted entirely — the values are absolute counts, so the kept
  //    bars keep their meaning without them.
  //  - mergeUnknown (pie chart, §1 addendum): folded into one slice labelled "неизвестно", summing
  //    both counts and keeping `unknown: true` so it still gets the dedicated grey colour and sits
  //    last, unsorted among the real values — this is a display share chart, so the two rows must
  //    stay represented, just as one instead of two thin wedges.
  if (options.dropUnknown) {
    // nothing pushed
  } else if (options.mergeUnknown) {
    if (unknown.length) {
      const mergedCount = unknown.reduce((sum, r) => sum + r.count, 0);
      slices.push({ key: MERGED_UNKNOWN_KEY, label: UI.notKnown, count: mergedCount, unknown: true, codes: unknown.map((r) => r.key) });
    }
  } else {
    for (const r of unknown) slices.push({ key: r.key, label: labelFor(dimension, r.key, labels).label, count: r.count, unknown: true });
  }

  const knownShare = total === 0 ? 0 : knownTotal / total;
  // An empty distribution has nothing to be honest about: a "0% of records" caveat would only be noise.
  const caveat =
    total > 0 && dimension.caveat && knownShare < CAVEAT_BELOW
      ? options.dropUnknown
        ? UI.chart.caveatOmitted(formatPercent(knownShare))
        : UI.chart.caveat(formatPercent(knownShare))
      : null;
  return { slices, knownShare, caveat };
}

function colours(slices: Slice[], palette: string[], unknownColor: string): string[] {
  let i = 0;
  return slices.map((s) => (s.unknown ? unknownColor : palette[i++ % palette.length]));
}

/** Above this length a bar category label wraps onto two lines (§4): short enough that the dictionary's
    longest single-word or two-letter-plus-word labels ("не распознано", "принудительные" alone) still
    read as one line, long enough that only the two genuinely long phrases below trigger it. */
const BAR_LABEL_WRAP_AT = 16;

/** Two-line wrap for a bar category label that's too long for the axis's reserved width (§4): breaks
    at the label's own first space — "ссылка, спецпоселение" becomes "ссылка,\nспецпоселение",
    "принудительные работы" becomes "принудительные\nработы" — rather than inventing shorter Russian
    names for either. `axisLabel.width`/`overflow` alone was tried first, but ECharts' own automatic
    word-break needed an implausibly wide reserved column to avoid splitting "спецпоселение" itself
    mid-word (it still broke there well under the width that word measures at on its own); a literal
    `\n` at the label's own existing word boundary is exact and doesn't depend on tuning that against
    font metrics. Only applied to the y-axis's own label text — the `Slice.label` used by the tooltip,
    the legend and every other chart stays exactly as the dictionary wrote it. */
function wrapBarLabel(label: string): string {
  if (label.length <= BAR_LABEL_WRAP_AT) return label;
  const breakAt = label.indexOf(" ");
  return breakAt < 0 ? label : `${label.slice(0, breakAt)}\n${label.slice(breakAt + 1)}`;
}

/** A bar shorter than this share of the longest one is a hairline: its value is written beside it. */
const TINY_BAR_SHARE = 0.06;

export function barOption(
  title: string,
  slices: Slice[],
  palette: string[],
  unknownColor: string,
  options: { labelTinyBars?: boolean; emptyLabelColor?: string } = {},
): EChartsOption {
  const emptyLabelColor = options.emptyLabelColor ?? unknownColor;
  const colors = colours(slices, palette, unknownColor);
  const max = slices.reduce((top, s) => Math.max(top, s.count), 0);
  return {
    title: { text: title, left: 0 },
    grid: { left: 8, right: 24, top: CHART_TITLE_GAP, bottom: 8, containLabel: true },
    // `hideOverlap` (not a fixed `splitNumber`/rotation) drops whichever computed tick labels would
    // collide, based on their own rendered width against the plot area ECharts actually laid out —
    // it reacts to the real container width (292px on the home page, wider on "Цифры") instead of a
    // hard-coded breakpoint, and it only hides label *text*; the ticks, gridlines and bars underneath
    // are untouched, so nothing about what a bar's length means changes, and the tooltip (below) still
    // gives the exact value regardless of which axis labels are shown.
    xAxis: { type: "value", axisLabel: { formatter: (v: number) => formatInt(v), hideOverlap: true } },
    yAxis: {
      type: "category",
      inverse: true,
      data: slices.map((s) => wrapBarLabel(s.label)),
      // A generous, rarely-hit safety net — every current label's longest line measures well under
      // this — for a future dictionary value with no word boundary to wrap at.
      // A row with no records under the current filter keeps its place, its label dimmed: the chart's
      // height then does not change every time a filter narrows the data (2026-09-18 review).
      axisLabel: {
        width: 140,
        overflow: "truncate",
        formatter: (value: string, index: number) => (slices[index]?.empty ? `{empty|${value}}` : value),
        rich: { empty: { color: emptyLabelColor } },
      },
    },
    tooltip: { trigger: "item", valueFormatter: (v) => formatInt(Number(v)) },
    series: [
      {
        type: "bar",
        data: slices.map((s, i) => ({
          value: s.count,
          itemStyle: { color: colors[i] },
          // Only the hairlines get a number: a chart whose largest value dwarfs the rest ("Партийность")
          // otherwise shows a row of empty-looking labels. The tooltip still carries every exact value.
          label:
            options.labelTinyBars && max > 0 && s.count > 0 && s.count < max * TINY_BAR_SHARE
              ? { show: true, position: "right" as const, formatter: () => formatInt(s.count) }
              : undefined,
        })),
        universalTransition: true,
      },
    ],
  };
}

export function pieOption(title: string, slices: Slice[], palette: string[], unknownColor: string): EChartsOption {
  const colors = colours(slices, palette, unknownColor);
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const shareOf = new Map(slices.map((s) => [s.label, total === 0 ? 0 : s.count / total]));
  return {
    title: { text: title, left: 0 },
    tooltip: { trigger: "item", valueFormatter: (v) => formatInt(Number(v)) },
    // A horizontal legend below the donut — items laid out side by side, not stacked in a column
    // beside it — carries the name and its share, so per-slice labels and leader lines (the old
    // `{b}: {d}%` formatter) can be dropped entirely — those are what truncated to "не распоз…" and
    // crossed the donut at 292px. `formatShareWords` matches the whole-percent rounding already used
    // elsewhere in prose; the tooltip still gives the exact count on hover. Left at its normal size —
    // if a container is too narrow for the whole row, ECharts wraps it onto a second line on its own
    // (maintainer review: that's the expected, deliberate behaviour, not a defect to design around by
    // shrinking the legend or narrowing the donut).
    legend: {
      orient: "horizontal",
      bottom: 0,
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      formatter: (name: string) => `${name}: ${formatShareWords(shareOf.get(name) ?? 0)}`,
    },
    series: [{
      type: "pie",
      // The box the legend does not use, below the title: radius and center are percentages of this
      // box, not of the whole canvas, so the donut clears both the title and the legend the same way.
      left: 0,
      right: 0,
      top: CHART_TITLE_GAP,
      bottom: PIE_LEGEND_HEIGHT,
      radius: ["45%", "75%"],
      label: { show: false },
      labelLine: { show: false },
      data: slices.map((s, i) => ({ name: s.label, value: s.count, itemStyle: { color: colors[i] } })),
      universalTransition: true,
    }],
  };
}

export function histogramOption(
  title: string,
  rows: Array<{ key: string; count: number }>,
  range: [number, number],
  accent: string,
  highlight?: { years: [number, number]; dim: string },
): { option: EChartsOption; unknownCount: number } {
  const byYear = new Map(rows.filter((r) => /^\d{4}$/.test(r.key)).map((r) => [Number(r.key), r.count]));
  const years: string[] = [];
  const data: Array<number | { value: number; itemStyle: { color: string } }> = [];
  for (let y = range[0]; y <= range[1]; y++) {
    years.push(String(y));
    const value = byYear.get(y) ?? 0;
    if (!highlight) data.push(value);
    else {
      const inRange = y >= highlight.years[0] && y <= highlight.years[1];
      data.push({ value, itemStyle: { color: inRange ? accent : highlight.dim } });
    }
  }
  const unknownCount = rows.filter((r) => UNKNOWN_KEYS.has(r.key)).reduce((s, r) => s + r.count, 0);
  return {
    option: {
      title: { text: title, left: 0 },
      grid: { left: 8, right: 16, top: CHART_TITLE_GAP, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: years, axisLabel: { interval: 4 } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => formatInt(v) } },
      tooltip: { trigger: "axis", valueFormatter: (v) => formatInt(Number(v)) },
      series: [{ type: "bar", data, itemStyle: { color: accent }, barCategoryGap: "20%", universalTransition: true }],
    },
    unknownCount,
  };
}
