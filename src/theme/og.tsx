import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { UI } from "@/lib/ui-text";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * The light tokens, spelled out rather than read from CSS: a social card is shown on whatever
 * background the reader's app gives it, so it always uses the paper palette — the same rule print
 * follows (src/theme/tokens.ts). Satori resolves no CSS variables, so these cannot be `var(--ink)`.
 */
const C = { paper: "#f6f3ec", ink: "#1e1b17", muted: "#6a635a", accent: "#9a4a2e", rule: "#e2dccf" };

/**
 * Satori, which draws these cards, ships no font of its own beyond Latin: Cyrillic has to be handed
 * in. These are Inter's cyrillic+latin subsets under `assets/` — 159 KB the pair, against the 500 KB
 * ceiling `ImageResponse` puts on the whole bundle, which is why they are subsets and not the full
 * faces (325 KB each). The server reads them to draw a PNG; they never reach a browser, unlike the
 * font the removed PDF export used to make the client download. Inter is SIL OFL; the licence sits
 * beside them in `assets/LICENSE-Inter.txt`, as it did under `public/fonts/` before that export went.
 */
export async function ogFonts() {
  const [regular, semiBold] = await Promise.all([
    readFile(join(process.cwd(), "assets/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "assets/Inter-SemiBold.ttf")),
  ]);
  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: semiBold, weight: 600 as const, style: "normal" as const },
  ];
}

/**
 * The shell every card shares: the wordmark at the top, the body in the middle, the credit along the
 * bottom. Satori supports flexbox and little else — no grid, and every element with more than one
 * child needs an explicit `display: flex`.
 */
export function ogCard(body: ReactElement): ReactElement {
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "60px 72px", backgroundColor: C.paper, color: C.ink, fontFamily: "Inter",
        backgroundImage: "linear-gradient(to bottom, rgba(154,74,46,0.07), rgba(30,27,23,0.04) 40%, rgba(246,243,236,0) 78%)",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: "0.01em" }}>
        <span style={{ fontWeight: 600 }}>MEMO</span>
        <span style={{ fontWeight: 400, color: C.muted }}>ru</span>
      </div>
      {body}
      <div style={{ display: "flex", borderTop: `1px solid ${C.rule}`, paddingTop: 20, fontSize: 23, color: C.muted }}>
        {UI.meta.ogSource}
      </div>
    </div>
  );
}

export function ogHeadline(title: string, lead: string): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 66, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.015em" }}>{title}</div>
      <div style={{ display: "flex", marginTop: 22, maxWidth: 900, fontSize: 29, lineHeight: 1.35, color: C.muted }}>{lead}</div>
    </div>
  );
}

export function ogPerson(name: string, years: string | null, place: string | null): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 62, fontWeight: 600, lineHeight: 1.12, letterSpacing: "-0.015em" }}>{name}</div>
      {years !== null && <div style={{ display: "flex", marginTop: 16, fontSize: 38, color: C.accent }}>{years}</div>}
      {place !== null && <div style={{ display: "flex", marginTop: 16, fontSize: 27, color: C.muted }}>{place}</div>}
    </div>
  );
}
