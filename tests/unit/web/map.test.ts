import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHART_TITLE_GAP } from "../../../src/lib/chart-theme";
import {
  MAP_ASPECT,
  MAP_ASPECT_SCALE,
  MAP_EXCEPTIONS,
  MAP_LEGEND_ITEM_HEIGHT,
  MAP_LEGEND_ITEM_WIDTH,
  MAP_LEGEND_TEXT_GAP,
  MAP_TITLE_GAP,
  choroplethOption,
  codesForPolygon,
  joinCounts,
  mapKey,
} from "../../../src/lib/map";
import { geoCodes } from "../../../src/lib/map-server";

describe("mapKey", () => {
  it("keeps Russian subdivisions, collapses the two oblasts, rolls other subdivisions up to the country", () => {
    expect(mapKey("RU-CHE")).toBe("RU-CHE");
    expect(mapKey("RU-MOS")).toBe("RU-MOW");
    expect(mapKey("RU-LEN")).toBe("RU-SPE");
    expect(mapKey("UA-43")).toBe("UA");
    expect(mapKey("UA-40")).toBe("UA");
    expect(mapKey("KZ")).toBe("KZ");
    expect(mapKey("unknown")).toBe("unknown");
  });
});

describe("joinCounts", () => {
  it("sums by map key and reports unmatched codes", () => {
    const { data, unmatched } = joinCounts(
      [
        { key: "RU-CHE", count: 5 },
        { key: "UA-43", count: 2 },
        { key: "UA", count: 3 },
        { key: "unknown", count: 9 },
        { key: "SU", count: 1 },
        { key: "ZZ-1", count: 4 },
      ],
      geoCodes("regions"),
    );
    expect(data).toEqual(
      expect.arrayContaining([
        { name: "RU-CHE", value: 5 },
        { name: "UA", value: 5 },
      ]),
    );
    expect(data).toHaveLength(2);
    expect(unmatched).toEqual(
      expect.arrayContaining([
        { key: "unknown", count: 9 },
        { key: "SU", count: 1 },
        { key: "ZZ-1", count: 4 },
      ]),
    );
    expect(MAP_EXCEPTIONS).toContain("SU");
  });

  it("uses only the code set it is given", () => {
    const { data, unmatched } = joinCounts([{ key: "RU-CHE", count: 5 }], new Set(["RU-MOW"]));
    expect(data).toEqual([]);
    expect(unmatched).toEqual([{ key: "RU-CHE", count: 5 }]);
  });
});

describe("choroplethOption", () => {
  it("joins by the code property", () => {
    const option = choroplethOption({ title: "t", data: [{ name: "RU-CHE", value: 1 }], max: 1, accent: "#123", from: "#eee", mapName: "regions" }) as {
      series: Array<{ map: string; nameProperty: string }>;
      visualMap: { inRange: { color: string[] } };
    };
    expect(option.series[0]).toMatchObject({ map: "regions", nameProperty: "code" });
    expect(option.visualMap.inRange.color).toEqual(["#eee", "#123"]);
  });

  it("scales the visual map from zero to the given maximum", () => {
    const option = choroplethOption({ title: "t", data: [], max: 0, accent: "#123", from: "#eee", mapName: "countries" }) as {
      visualMap: { min: number; max: number };
    };
    expect(option.visualMap.min).toBe(0);
    expect(option.visualMap.max).toBeGreaterThan(0);
  });

  it("clears the title with its own, smaller offset and fills the card below it", () => {
    const option = choroplethOption({ title: "t", data: [], max: 1, accent: "#123", from: "#eee", mapName: "regions" }) as {
      series: Array<{ top: number; left: number; right: number; bottom: number; aspectScale: number }>;
    };
    // Smaller than the bar/histogram gap: there it also holds the value axis's labels, here it is blank.
    expect(option.series[0].top).toBeGreaterThan(20);
    expect(option.series[0].top).toBeLessThan(CHART_TITLE_GAP);
    expect(option.series[0]).toMatchObject({ left: 0, right: 0, bottom: 0, aspectScale: MAP_ASPECT_SCALE });
  });

  it("shrinks the legend to fit the narrowest card this component draws (390px viewport)", () => {
    // Regression for a fix-round finding (2026-09-18): ECharts' visualMap defaults (itemHeight 140,
    // textGap 10) total ~190px and overflowed past the container's own top edge once the card's height
    // became width-driven — a 390px-wide card gives the map only ~161px, measured with Playwright.
    // 20px is a generous stand-in for one text label's own height (the real font is smaller); this stays
    // well under that 161px budget so a future itemHeight/textGap increase gets caught here rather than
    // rediscovered by re-measuring the live page.
    const option = choroplethOption({ title: "t", data: [], max: 1, accent: "#123", from: "#eee", mapName: "regions" }) as {
      visualMap: { itemHeight: number; itemWidth: number; textGap: number };
    };
    expect(option.visualMap).toMatchObject({
      itemHeight: MAP_LEGEND_ITEM_HEIGHT,
      itemWidth: MAP_LEGEND_ITEM_WIDTH,
      textGap: MAP_LEGEND_TEXT_GAP,
    });
    const estimatedFootprint = MAP_LEGEND_ITEM_HEIGHT + 2 * (MAP_LEGEND_TEXT_GAP + 20);
    expect(estimatedFootprint).toBeLessThan(150);
  });

  it("pins the series to all four edges regardless of title — the shape comes from the container, not this option", () => {
    // With no title the map still spans the whole box (top: 0): the fixed left/right/top/bottom fit is
    // always a stretch to the container's own box. Callers keep the map from looking flattened or
    // stretched by giving that box `MAP_ASPECT` as its own shape (Choropleth.module.css's `.ratio`),
    // not by varying this option with card height — that box, not this function, is what the two pages
    // now share.
    const withTitle = choroplethOption({ title: "t", data: [], max: 1, accent: "#123", from: "#eee", mapName: "regions" }) as {
      series: Array<{ left: number; right: number; bottom: number }>;
    };
    const withoutTitle = choroplethOption({ data: [], max: 1, accent: "#123", from: "#eee", mapName: "regions" }) as {
      series: Array<{ top: number; left: number; right: number; bottom: number }>;
    };
    expect(withoutTitle.series[0]).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(withTitle.series[0]).toMatchObject({ left: 0, right: 0, bottom: 0 });
  });
});

describe("MAP_ASPECT", () => {
  it("matches the checked-in geometry's own lon/lat box times MAP_ASPECT_SCALE", () => {
    // Recomputes the bounding box from the actual file so MAP_ASPECT (lib/map.ts) cannot silently drift
    // from the geometry it is meant to describe.
    const geo = JSON.parse(readFileSync("public/geo/regions.json", "utf8")) as {
      features: Array<{ geometry: { coordinates: unknown } }>;
    };
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const walk = (coords: unknown): void => {
      if (typeof (coords as number[])[0] === "number") {
        const [x, y] = coords as [number, number];
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
        return;
      }
      for (const c of coords as unknown[]) walk(c);
    };
    for (const f of geo.features) walk(f.geometry.coordinates);

    const rawAspect = (xMax - xMin) / (yMax - yMin);
    expect(MAP_ASPECT).toBeCloseTo(rawAspect * MAP_ASPECT_SCALE, 3);
    // Sanity check on the shape itself: neither the flattened default (0.75) nor a square-ish crop.
    expect(MAP_ASPECT).toBeGreaterThan(1.5);
    expect(MAP_ASPECT).toBeLessThan(2.5);
  });
});

describe("MAP_TITLE_GAP", () => {
  it("is exported so Choropleth.tsx can add the same fixed pixels to its aspect box", () => {
    expect(MAP_TITLE_GAP).toBeGreaterThan(0);
  });
});

describe("codesForPolygon", () => {
  it("returns every code that folds into the polygon and never an exception code", () => {
    const codes = ["RU-MOW", "RU-MOS", "RU-SPE", "KZ-ALA", "KZ-AST", "UA", "SU", "unknown"];
    expect(codesForPolygon(codes, "RU-MOW")).toEqual(["RU-MOW", "RU-MOS"]);
    expect(codesForPolygon(codes, "KZ")).toEqual(["KZ-ALA", "KZ-AST"]);
    expect(codesForPolygon(codes, "UA")).toEqual(["UA"]);
    expect(codesForPolygon(codes, "SU")).toEqual([]);
    expect(codesForPolygon(codes, "XX")).toEqual([]);
  });
});
