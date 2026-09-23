import { ImageResponse } from "next/og";
import { ogClip } from "@/lib/metadata";
import { loadPerson } from "@/lib/person";
import { parsePersonParam } from "@/lib/person-url";
import { fullName, lifeYears } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, ogFonts, ogHeadline, ogPerson } from "@/theme/og";

export const alt = UI.meta.ogAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The card behind a shared person page — the page the site's own share button points at, so this is
 * the card most people will actually see. A missing or malformed id falls back to the site card
 * rather than erroring: a social crawler that gets a 500 shows no card at all, and the page itself
 * has already answered 404 by the time anyone follows the link.
 */
export default async function Image({ params }: PageProps<"/person/[id]">) {
  const { id } = await params;
  let parsed: { id: number } | null = null;
  try {
    parsed = parsePersonParam(decodeURIComponent(id));
  } catch {
    parsed = null;
  }
  const data = parsed === null ? null : await loadPerson(parsed.id);
  const fonts = await ogFonts();
  if (data === null) {
    return new ImageResponse(ogCard(ogHeadline("Имена и цифры репрессий в СССР", UI.siteTagline)), { ...size, fonts });
  }
  const name = fullName(data.person);
  const place = data.person.birthPlaceRaw;
  return new ImageResponse(
    ogCard(ogPerson(ogClip(name, 42), lifeYears(data.person), place === null ? null : ogClip(place, 68))),
    { ...size, fonts },
  );
}
