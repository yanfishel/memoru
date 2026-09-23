import type { MantineColorsTuple } from "@mantine/core";

/**
 * The site's colour tokens (spec §3.1): warm paper and ink in light, warm graphite and paper-white
 * in dark, one brick accent. Pure data — the resolver in ./theme.ts turns it into CSS variables.
 */
export interface Scheme {
  paper: string;
  surface: string;
  rule: string;
  ink: string;
  muted: string;
  accent: string;
  ok: string;
}

export const LIGHT: Scheme = {
  paper: "#f6f3ec",
  surface: "#fffdf8",
  rule: "#e2dccf",
  ink: "#1e1b17",
  muted: "#6a635a",
  accent: "#9a4a2e",
  ok: "#3f6b3a",
};

export const DARK: Scheme = {
  paper: "#1a1714",
  surface: "#211d19",
  rule: "#332d27",
  ink: "#ece6da",
  muted: "#a39a8c",
  accent: "#d08a6c",
  ok: "#8fbf86",
};

/** Mantine wants ten shades, light to dark; index 6 is the light-scheme primary, index 4 the dark one. */
export const BRICK: MantineColorsTuple = [
  "#fbeee9", "#f3d9cf", "#e8bcab", "#dc9f88", "#d08a6c",
  "#c27453", "#9a4a2e", "#843f28", "#6d3421", "#55291a",
];

/** Eight chart hues spaced around the wheel at a common lightness (from Plan 2c), then their dark-scheme lifts. */
export const VIZ_LIGHT = ["#2f5d7c", "#2f6f6a", "#4e7440", "#8a7522", "#9a5a26", "#8e3f3a", "#7c4470", "#4d4f8c"];
export const VIZ_DARK = ["#7fb0cf", "#6fb6ad", "#96c088", "#ccb45c", "#d79a60", "#d2817b", "#bc8bb0", "#9497d6"];
export const VIZ_UNKNOWN = { light: "#8b8b85", dark: "#7f8683" };

/** The CSS variables one scheme publishes: our tokens plus the Mantine variables they override. */
export function schemeVariables(scheme: Scheme, viz: string[], unknown: string): Record<string, string> {
  const out: Record<string, string> = {
    "--paper": scheme.paper,
    "--surface": scheme.surface,
    "--rule": scheme.rule,
    "--ink": scheme.ink,
    "--muted": scheme.muted,
    "--accent": scheme.accent,
    "--ok": scheme.ok,
    "--viz-unknown": unknown,
    "--mantine-color-body": scheme.paper,
    "--mantine-color-text": scheme.ink,
    "--mantine-color-dimmed": scheme.muted,
    "--mantine-color-default": scheme.surface,
    "--mantine-color-default-border": scheme.rule,
    "--mantine-color-anchor": scheme.accent,
  };
  viz.forEach((hue, i) => {
    out[`--viz-${i + 1}`] = hue;
  });
  return out;
}

/**
 * Paper is light whatever the screen scheme: in print the light tokens replace the dark ones, or a page
 * printed from the dark scheme comes out as pale text on white. `:root:root[…]` outranks the
 * resolver's `:root[data-mantine-color-scheme="dark"]` without `!important`.
 */
export function printCss(): string {
  const variables = { ...schemeVariables(LIGHT, VIZ_LIGHT, VIZ_UNKNOWN.light), "--mantine-color-scheme": "light" };
  const body = Object.entries(variables).map(([name, value]) => `${name}: ${value};`).join(" ");
  return `@media print { :root:root[data-mantine-color-scheme] { ${body} } }`;
}
