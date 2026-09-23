import { createTheme, type CSSVariablesResolver } from "@mantine/core";
import { BRICK, DARK, LIGHT, VIZ_DARK, VIZ_LIGHT, VIZ_UNKNOWN, schemeVariables } from "./tokens";

/** Spec §3: Inter for the UI, Literata for headings and names, brick as the only accent, 12px cards. */
export const theme = createTheme({
  fontFamily: "var(--font-sans)",
  headings: { fontFamily: "var(--font-serif)", fontWeight: "400" },
  primaryColor: "brick",
  primaryShade: { light: 6, dark: 4 },
  colors: { brick: BRICK },
  defaultRadius: "md",
  radius: { md: "0.75rem" },
  cursorType: "pointer",
  respectReducedMotion: true,
});

export const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: schemeVariables(LIGHT, VIZ_LIGHT, VIZ_UNKNOWN.light),
  dark: schemeVariables(DARK, VIZ_DARK, VIZ_UNKNOWN.dark),
});
