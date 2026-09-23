import type { EChartsOption } from "echarts";
import { formatInt } from "./format";

/** The map's own title offset: the title is ~21px tall (fontSize 15, weight 600) plus a small band.
    Exported so `Choropleth.tsx` can add the same fixed pixels on top of the width-driven aspect box
    (see `MAP_ASPECT`) — the title lives inside the same ECharts canvas as the polygons, so the
    container must reserve room for it beyond what the polygons' own shape needs. */
export const MAP_TITLE_GAP = 30;

/** regions.json's own lon/lat bounding box (computed once by `tests/unit/web/map.test.ts`, which fails
    if the checked-in geometry ever changes shape): x 19.604…190.271, y 35.148…81.854. */
const MAP_GEO_WIDTH = 190.271 - 19.604;
const MAP_GEO_HEIGHT = 81.854 - 35.148;

/** ECharts' default `aspectScale` (0.75) is tuned for a country near the equator, where a degree of
    longitude and a degree of latitude cover about the same ground. This geometry's own mid-latitude is
    about (35.148+81.854)/2 ≈ 58.5°N, where a degree of longitude covers only cos(58.5°) ≈ 0.52 as much
    ground as a degree of latitude — 0.75 draws the country visibly flattened east-west. 0.55, close to
    that 0.52, is what a visual check (2026-09-18) confirmed reads correctly — recognisably Russia's own
    shape, not stretched wide or squeezed tall. */
export const MAP_ASPECT_SCALE = 0.55;

/** The map's own drawn width/height once ECharts applies `MAP_ASPECT_SCALE` to the raw lon/lat box
    (`series.top/right/bottom` still pin all four edges — see `choroplethOption` below — so this is the
    ratio a CSS `aspect-ratio` gives the container to make that four-edge fit a no-op instead of a
    stretch). Matches ECharts' own `aspect = rect.width / rect.height * aspectScale` computation
    (echarts/lib/coord/geo/geoCreator.js). */
export const MAP_ASPECT = (MAP_GEO_WIDTH / MAP_GEO_HEIGHT) * MAP_ASPECT_SCALE;

/** The colour-scale legend's own footprint: ECharts' `visualMap` defaults (`itemHeight: 140`,
    `textGap: 10`, two text labels) add up to roughly 190px regardless of the container — fine against
    the old fixed heights (420/"min(70vh, 620px)"), but the narrowest card this site supports (390px
    viewport, MAP_ASPECT above) now gives the map only ~161px of height, and the legend overflowed
    upward past the container's own top edge, clipped by EChart.module.css's `overflow: hidden`
    (2026-09-18 review, found by a fix-round remeasurement). These three sum to about 112px — comfortably
    inside 161px on every card this component draws, at the cost of a visibly smaller legend on the
    widest cards too (no per-breakpoint sizing exists elsewhere in this codebase to vary it instead). */
export const MAP_LEGEND_ITEM_HEIGHT = 70;
export const MAP_LEGEND_ITEM_WIDTH = 12;
export const MAP_LEGEND_TEXT_GAP = 6;

/**
 * Codes that legitimately have no polygon. Everything else must join, and
 * `tests/unit/web/geo-coverage.test.ts` fails if a dictionary code does not.
 */
export const MAP_EXCEPTIONS: readonly string[] = [
  // The USSR as a whole: no successor polygon, and spreading it over the republics would invent data.
  "SU",
  // The two codes the ETL uses for a missing and for an unmapped raw value (scripts/etl/normalize/dicts.ts).
  "unknown",
  "unrecognized",
];

/** source_region collapses the two capital oblasts into the cities (census findings); the map does the same. */
const COLLAPSE: Record<string, string> = { "RU-MOS": "RU-MOW", "RU-LEN": "RU-SPE" };

/** The polygon code a dictionary code belongs to: Russia by unit, everything else by country. */
export function mapKey(code: string): string {
  if (code.startsWith("RU-")) return COLLAPSE[code] ?? code;
  const dash = code.indexOf("-");
  return dash > 0 ? code.slice(0, dash) : code;
}

/** Every dictionary code the given polygon paints (spec §4.2 click-to-filter): the inverse of `mapKey`. */
export function codesForPolygon(codes: Iterable<string>, polygon: string): string[] {
  // No polygon paints an exception code (mapKey never produces one for a non-exception input), so a
  // click that somehow names one — it should never reach the map — simply matches nothing.
  if (MAP_EXCEPTIONS.includes(polygon)) return [];
  const out: string[] = [];
  for (const code of codes) {
    if (mapKey(code) === polygon) out.push(code);
  }
  return out;
}

export type MapLayer = "regions" | "countries";

/**
 * Sums counts per polygon. `known` is the layer's code set — `geoCodes` from `./map-server` on the server,
 * the fetched layer in the browser; this module stays free of file access so it can be bundled for the client.
 * Codes the geometry does not know — the exceptions above included — are returned separately so the caller can
 * show them as "no region" instead of silently losing them.
 */
export function joinCounts(
  rows: Array<{ key: string; count: number }>,
  known: Set<string>,
): { data: Array<{ name: string; value: number }>; unmatched: Array<{ key: string; count: number }> } {
  const sums = new Map<string, number>();
  const unmatched: Array<{ key: string; count: number }> = [];
  for (const row of rows) {
    const key = mapKey(row.key);
    if (MAP_EXCEPTIONS.includes(key) || !known.has(key)) {
      unmatched.push(row);
      continue;
    }
    sums.set(key, (sums.get(key) ?? 0) + row.count);
  }
  return { data: [...sums].map(([name, value]) => ({ name, value })), unmatched };
}

export function choroplethOption(input: {
  /** Omitted hides the drawn title and lets the map claim the band it would have reserved
      (the explore page's map: the layer switcher above it already names the layer). */
  title?: string;
  data: Array<{ name: string; value: number }>;
  max: number;
  accent: string;
  /** The ramp's zero colour: the scheme's rule colour, so the map reads in dark too. */
  from: string;
  mapName: MapLayer;
  names?: Map<string, string>;
}): EChartsOption {
  const max = Math.max(1, input.max);
  return {
    title: input.title ? { text: input.title, left: 0 } : undefined,
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const p = params as { name: string; value?: number };
        const label = input.names?.get(p.name) ?? p.name;
        const value = p.value === undefined || Number.isNaN(p.value) ? "—" : formatInt(p.value);
        return `${label}: ${value}`;
      },
    },
    visualMap: {
      min: 0,
      max,
      right: 0,
      bottom: 0,
      // Shrunk from ECharts' defaults so the legend fits the shortest card this component draws
      // (390px viewport) without its labels overflowing past the container's own top edge — see
      // MAP_LEGEND_ITEM_HEIGHT's comment.
      itemHeight: MAP_LEGEND_ITEM_HEIGHT,
      itemWidth: MAP_LEGEND_ITEM_WIDTH,
      textGap: MAP_LEGEND_TEXT_GAP,
      calculable: false,
      inRange: { color: [input.from, input.accent] },
      text: [formatInt(max), "0"],
    },
    series: [
      {
        type: "map",
        map: input.mapName,
        nameProperty: "code",
        roam: true,
        // Corrects the raw lon/lat box for this geometry's own mid-latitude (see MAP_ASPECT_SCALE):
        // without it ECharts' default 0.75 draws the country visibly flattened east-west.
        aspectScale: MAP_ASPECT_SCALE,
        // A full-width box below the title: without it the geo coordinate system defaults to the
        // whole canvas and the title sits on top of the polygons. The offset is smaller than the
        // bar/histogram `CHART_TITLE_GAP`, because there that space also holds the value axis's
        // labels, while here it would be blank paper above the map (2026-09-18 review). With no
        // title at all (explore page), that reserved band is blank paper too, so the map claims it.
        // These four edges pin the series to the whole container, which would ordinarily stretch the
        // geometry to whatever rectangle the box gives it — but the container itself now carries
        // `MAP_ASPECT` as a CSS aspect ratio (Choropleth.tsx), so the box already has the same shape
        // the polygons do, and this fit is a no-op instead of a stretch.
        left: 0,
        right: 0,
        top: input.title ? MAP_TITLE_GAP : 0,
        bottom: 0,
        data: input.data,
        emphasis: { label: { show: false } },
      },
    ],
  };
}
