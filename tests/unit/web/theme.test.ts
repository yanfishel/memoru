import { describe, expect, it } from "vitest";
import { BRICK, DARK, LIGHT, VIZ_DARK, VIZ_LIGHT, VIZ_UNKNOWN, printCss, schemeVariables } from "../../../src/theme/tokens";

const HEX = /^#[0-9a-f]{6}$/;

describe("tokens", () => {
  it("defines the brick tuple with the two accents at Mantine's primary shades", () => {
    expect(BRICK).toHaveLength(10);
    expect(BRICK[6]).toBe(LIGHT.accent);
    expect(BRICK[4]).toBe(DARK.accent);
    for (const shade of BRICK) expect(shade).toMatch(HEX);
  });

  it("has eight chart hues per scheme, all lower-case hex", () => {
    expect(VIZ_LIGHT).toHaveLength(8);
    expect(VIZ_DARK).toHaveLength(8);
    for (const hue of [...VIZ_LIGHT, ...VIZ_DARK, VIZ_UNKNOWN.light, VIZ_UNKNOWN.dark]) expect(hue).toMatch(HEX);
  });

  it("publishes every token the site reads, for both schemes", () => {
    const light = schemeVariables(LIGHT, VIZ_LIGHT, VIZ_UNKNOWN.light);
    const dark = schemeVariables(DARK, VIZ_DARK, VIZ_UNKNOWN.dark);
    const names = ["--paper", "--surface", "--rule", "--ink", "--muted", "--accent", "--ok", "--viz-unknown", ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `--viz-${i}`)];
    for (const name of names) {
      expect(light[name], name).toMatch(HEX);
      expect(dark[name], name).toMatch(HEX);
    }
    expect(light["--mantine-color-body"]).toBe(LIGHT.paper);
    expect(dark["--mantine-color-text"]).toBe(DARK.ink);
  });

  it("forces the light tokens in print, above the resolver's dark selector", () => {
    const css = printCss();
    expect(css.startsWith("@media print { :root:root[data-mantine-color-scheme] {")).toBe(true);
    for (const [name, value] of Object.entries(schemeVariables(LIGHT, VIZ_LIGHT, VIZ_UNKNOWN.light))) {
      expect(css, name).toContain(`${name}: ${value};`);
    }
    expect(css).toContain("--mantine-color-scheme: light;");
    expect(css).not.toContain(DARK.ink);
    expect(css).not.toContain(DARK.paper);
  });
});
