import { describe, expect, it } from "vitest";
import { chartTheme, sameStyle, type ChartStyle } from "../../../src/lib/chart-theme";

const style: ChartStyle = {
  text: "#111", muted: "#666", rule: "#ddd", surface: "#fff", accent: "#900",
  palette: ["#111", "#222"], unknown: "#999", font: "Inter", motion: true, scheme: "light",
};

interface ThemeShape {
  color: string[];
  backgroundColor: string;
  animation: boolean;
  textStyle: { color: string; fontFamily: string };
  title: { top: number; textStyle: { color: string } };
  categoryAxis: { axisLabel: { color: string } };
  valueAxis: { splitLine: { lineStyle: { color: string } } };
  tooltip: { backgroundColor: string; borderColor: string; textStyle: { color: string }; appendTo: string; confine: boolean };
}

describe("chartTheme", () => {
  it("paints text, axes, tooltips and the palette from the style", () => {
    const t = chartTheme(style) as unknown as ThemeShape;
    expect(t.color).toEqual(["#111", "#222"]);
    expect(t.backgroundColor).toBe("transparent");
    expect(t.textStyle).toEqual({ color: "#111", fontFamily: "Inter" });
    expect(t.title.textStyle.color).toBe("#111");
    expect(t.categoryAxis.axisLabel.color).toBe("#666");
    expect(t.valueAxis.splitLine.lineStyle.color).toBe("#ddd");
    expect(t.tooltip).toMatchObject({ backgroundColor: "#fff", borderColor: "#ddd", textStyle: { color: "#111" } });
    expect(t.animation).toBe(true);
  });

  // 2026-09-18 review: pins the title to the container's own top instead of ECharts' built-in 15px
  // default, which stacked with the card's own padding to read as too much air above the title.
  // CHART_TITLE_GAP is reduced by the same 15px so the gap below the title is unaffected.
  it("pins the title to the container's own top, not ECharts' own default offset", () => {
    const t = chartTheme(style) as unknown as ThemeShape;
    expect(t.title.top).toBe(0);
  });

  it("switches animation off for reduced motion", () => {
    expect((chartTheme({ ...style, motion: false }) as { animation: boolean }).animation).toBe(false);
  });

  // Fix round on e70ad83/2968fd3 (maintainer screenshot): a tooltip near a chart's own edge was
  // sliced by EChart.module.css's `.chart` `overflow: hidden`, because ECharts renders the tooltip
  // inside that same clipped element by default. `appendTo: "body"` renders it as its own element on
  // `document.body` instead; `confine: true` then keeps it from starting left of the chart's own left
  // edge (or right of its right edge) — including off the actual browser window at narrow widths —
  // without re-clipping or shrinking it.
  it("renders the tooltip outside any chart's own clipped box and keeps it from spilling off either edge", () => {
    const t = chartTheme(style) as unknown as ThemeShape;
    expect(t.tooltip.appendTo).toBe("body");
    expect(t.tooltip.confine).toBe(true);
  });
});

describe("sameStyle", () => {
  it("holds for two distinct objects with equal values", () => {
    expect(sameStyle(style, { ...style, palette: [...style.palette] })).toBe(true);
  });

  it("fails when one field differs", () => {
    expect(sameStyle(style, { ...style, text: "#112" })).toBe(false);
    expect(sameStyle(style, { ...style, scheme: "dark" })).toBe(false);
    expect(sameStyle(style, { ...style, motion: false })).toBe(false);
  });

  it("fails when the palette differs in a colour or in length", () => {
    expect(sameStyle(style, { ...style, palette: ["#111", "#333"] })).toBe(false);
    expect(sameStyle(style, { ...style, palette: ["#111"] })).toBe(false);
  });
});
