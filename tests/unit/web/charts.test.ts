import { describe, expect, it } from "vitest";
import { CHART_TITLE_GAP } from "../../../src/lib/chart-theme";
import { dimensionById } from "../../../src/lib/dimensions";
import { PIE_LEGEND_HEIGHT, barOption, histogramOption, pieOption, slicesFor, unknownCount } from "../../../src/lib/charts";
import { formatInt } from "../../../src/lib/format";
import { UI } from "../../../src/lib/ui-text";
import type { LabelMap } from "../../../src/db/queries";

// `polish` sorts before `russian` and `german` but is the smallest value, so sortOrder and count
// disagree: a top-N that ranked by sortOrder would keep поляки and drop немцы.
const labels: LabelMap = new Map([
  ["nationality", new Map([["polish", { labelRu: "поляки", sortOrder: 1 }], ["russian", { labelRu: "русские", sortOrder: 2 }], ["german", { labelRu: "немцы", sortOrder: 3 }], ["unknown", { labelRu: "не указано", sortOrder: 90 }]])],
  ["sex", new Map([["m", { labelRu: "мужчины", sortOrder: 1 }], ["f", { labelRu: "женщины", sortOrder: 2 }]])],
]);

const nationalityRows = [{ key: "unknown", count: 50 }, { key: "german", count: 20 }, { key: "russian", count: 25 }, { key: "polish", count: 5 }];

describe("slicesFor", () => {
  it("keeps the largest values under top, folds the tail and keeps unknown last with a caveat", () => {
    const { slices, knownShare, caveat } = slicesFor(dimensionById("nationality")!, nationalityRows, labels, { top: 2 });
    expect(slices.map((s) => [s.key, s.label, s.count, s.unknown])).toEqual([
      ["russian", "русские", 25, false],
      ["german", "немцы", 20, false],
      ["other_rest", UI.chart.otherRest, 5, false],
      ["unknown", "не указано", 50, true],
    ]);
    expect(knownShare).toBe(0.5);
    expect(caveat).toContain("50,0");
  });

  it("orders by sortOrder when no top is given", () => {
    const { slices } = slicesFor(dimensionById("nationality")!, nationalityRows, labels);
    expect(slices.map((s) => s.key)).toEqual(["polish", "russian", "german", "unknown"]);
  });

  it("reports no caveat for an empty distribution", () => {
    const { slices, knownShare, caveat } = slicesFor(dimensionById("nationality")!, [], labels);
    expect(slices).toEqual([]);
    expect(knownShare).toBe(0);
    expect(caveat).toBeNull();
  });

  it("gives no caveat for a covered dimension", () => {
    const { caveat, slices } = slicesFor(dimensionById("sex")!, [{ key: "m", count: 3 }, { key: "f", count: 1 }], labels);
    expect(caveat).toBeNull();
    expect(slices.map((s) => s.label)).toEqual(["мужчины", "женщины"]);
  });

  it("dropUnknown omits both unknown rows and swaps in the omitted-rows caveat text", () => {
    const { slices, caveat } = slicesFor(dimensionById("nationality")!, nationalityRows, labels, { dropUnknown: true });
    expect(slices.map((s) => s.key)).toEqual(["polish", "russian", "german"]);
    expect(slices.some((s) => s.unknown)).toBe(false);
    expect(caveat).toBe(UI.chart.caveatOmitted("50,0%"));
  });

  it("mergeUnknown folds both unknown rows into one «неизвестно» slice with the summed count, last and unsorted", () => {
    const rows = [{ key: "german", count: 20 }, { key: "unrecognized", count: 8 }, { key: "russian", count: 25 }, { key: "unknown", count: 50 }];
    const { slices } = slicesFor(dimensionById("nationality")!, rows, labels, { mergeUnknown: true });
    expect(slices.map((s) => [s.key, s.label, s.count, s.unknown])).toEqual([
      ["russian", "русские", 25, false],
      ["german", "немцы", 20, false],
      ["unknown_merged", "неизвестно", 58, true],
    ]);
    // The merged slice carries both underlying codes, in a stable order, so a filter panel can select
    // or deselect the pair as one option (DimensionEditor.tsx's `isSliceChecked`/`toggleSlice`).
    expect(slices.at(-1)?.codes).toEqual(["unknown", "unrecognized"]);
    expect(slices.slice(0, -1).every((s) => s.codes === undefined)).toBe(true);
  });

  it("mergeUnknown still labels a single present unknown-ish row «неизвестно», carrying just that one code", () => {
    const rows = [{ key: "german", count: 20 }, { key: "unrecognized", count: 8 }];
    const { slices } = slicesFor(dimensionById("nationality")!, rows, labels, { mergeUnknown: true });
    expect(slices.map((s) => [s.key, s.label, s.count, s.unknown])).toEqual([
      ["german", "немцы", 20, false],
      ["unknown_merged", "неизвестно", 8, true],
    ]);
    expect(slices.at(-1)?.codes).toEqual(["unrecognized"]);
  });
});

describe("options", () => {
  const slices = [{ key: "m", label: "мужчины", count: 3, unknown: false }, { key: "unknown", label: "не указано", count: 1, unknown: true }];
  it("colours unknown slices with the neutral colour", () => {
    const bar = barOption("Пол", slices, ["#111", "#222"], "#999") as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> };
    expect(bar.series[0].data.map((d) => d.itemStyle.color)).toEqual(["#111", "#999"]);
    const pie = pieOption("Пол", slices, ["#111", "#222"], "#999") as { series: Array<{ data: Array<{ name: string; itemStyle: { color: string } }> }> };
    expect(pie.series[0].data[1]).toMatchObject({ name: "не указано", itemStyle: { color: "#999" } });
  });

  it("fills every year of the range in a histogram and reports unknowns separately", () => {
    const { option, unknownCount: histogramUnknown } = histogramOption("Аресты", [{ key: "1937", count: 5 }, { key: "1939", count: 1 }, { key: "unknown", count: 7 }], [1936, 1939], "#111");
    const o = option as { xAxis: { data: string[] }; series: Array<{ data: number[] }> };
    expect(o.xAxis.data).toEqual(["1936", "1937", "1938", "1939"]);
    expect(o.series[0].data).toEqual([0, 5, 0, 1]);
    expect(histogramUnknown).toBe(7);
  });

  it("colours the highlighted years with the accent and the rest with the dim colour", () => {
    const { option } = histogramOption("Аресты", [{ key: "1937", count: 5 }], [1936, 1938], "#900", { years: [1937, 1938], dim: "#ccc" });
    const data = (option as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> }).series[0].data;
    expect(data.map((d) => d.itemStyle.color)).toEqual(["#ccc", "#900", "#900"]);
  });

  it("reserves the same title gap in the bar and histogram grid", () => {
    const bar = barOption("Пол", slices, ["#111"], "#999") as { grid: { top: number } };
    expect(bar.grid.top).toBe(CHART_TITLE_GAP);
    const { option } = histogramOption("Аресты", [], [1936, 1937], "#900");
    expect((option as { grid: { top: number } }).grid.top).toBe(CHART_TITLE_GAP);
  });

  it("offsets the pie's own box by the title gap and reserves the legend height at the bottom", () => {
    const pie = pieOption("Пол", slices, ["#111"], "#999") as {
      series: Array<{ top: number; left: number; right: number; bottom: number }>;
    };
    expect(pie.series[0]).toMatchObject({ top: CHART_TITLE_GAP, left: 0, right: 0, bottom: PIE_LEGEND_HEIGHT });
  });

  it("turns off the pie's own slice labels and leader lines, carrying the name and share in a horizontal legend below instead", () => {
    const pie = pieOption("Пол", slices, ["#111"], "#999") as {
      legend: { orient: string; bottom: number; left: string; formatter: (name: string) => string };
      series: Array<{ label: { show: boolean }; labelLine: { show: boolean } }>;
    };
    expect(pie.series[0].label.show).toBe(false);
    expect(pie.series[0].labelLine.show).toBe(false);
    expect(pie.legend.orient).toBe("horizontal");
    expect(pie.legend.bottom).toBe(0);
    expect(pie.legend.left).toBe("center");
    // 3 of the 4 counted records are "мужчины" (slices above: m=3, unknown=1).
    expect(pie.legend.formatter("мужчины")).toBe("мужчины: 75%");
  });

  it("wraps a long two-word category label onto two lines at its own word boundary", () => {
    const long = [
      { key: "exile", label: "ссылка, спецпоселение", count: 10, unknown: false },
      { key: "forced_labour", label: "принудительные работы", count: 3, unknown: false },
      { key: "camp", label: "лагерь", count: 7, unknown: false },
    ];
    const bar = barOption("Приговор", long, ["#111"], "#999") as { yAxis: { data: string[] } };
    expect(bar.yAxis.data).toEqual(["ссылка,\nспецпоселение", "принудительные\nработы", "лагерь"]);
  });

  it("leaves a short label — even the longest one kept as-is, «не распознано» — on one line", () => {
    const short = [{ key: "unrecognized", label: "не распознано", count: 1, unknown: true }];
    const bar = barOption("Приговор", short, ["#111"], "#999") as { yAxis: { data: string[] } };
    expect(bar.yAxis.data).toEqual(["не распознано"]);
  });

  // Fix round on e70ad83: the wider (wrapped) category column left the value axis less room, and its
  // computed ticks started colliding at 292px. `hideOverlap` reacts to the plot area ECharts actually
  // laid out rather than a fixed tick count or a pixel breakpoint, and only hides label text — the
  // formatter, the ticks/gridlines and the tooltip's exact value are all untouched.
  it("lets the value axis hide colliding tick labels instead of a fixed tick count", () => {
    const bar = barOption("Приговор", slices, ["#111"], "#999") as {
      xAxis: { axisLabel: { hideOverlap: boolean; formatter: (v: number) => string } };
    };
    expect(bar.xAxis.axisLabel.hideOverlap).toBe(true);
    // The formatter itself stays the exact, ungrouped-nothing value — hideOverlap only hides labels,
    // it never changes what one says.
    expect(bar.xAxis.axisLabel.formatter(800000)).toBe(formatInt(800000));
  });
});

describe("unknownCount", () => {
  // Same fold as the pie's merged «неизвестно» slice (charts.ts's UNKNOWN_KEYS): `unknown` + `unrecognized`.
  it("sums unknown and unrecognized when both keys are present", () => {
    const rows = [{ key: "RU-MOW", count: 500 }, { key: "unknown", count: 153 }, { key: "unrecognized", count: 99933 }];
    expect(unknownCount(rows)).toBe(100086);
  });
  it("counts just the one key that is present", () => {
    expect(unknownCount([{ key: "RU-MOW", count: 500 }, { key: "unrecognized", count: 40 }])).toBe(40);
  });
  it("is zero when neither key is present", () => {
    expect(unknownCount([{ key: "RU-MOW", count: 500 }])).toBe(0);
    expect(unknownCount([])).toBe(0);
  });
});
