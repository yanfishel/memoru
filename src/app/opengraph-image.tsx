import { ImageResponse } from "next/og";
import { UI } from "@/lib/ui-text";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, ogFonts, ogHeadline } from "@/theme/og";

export const alt = UI.meta.ogAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The card behind every link to the site that is not one person's page. */
export default async function Image() {
  return new ImageResponse(ogCard(ogHeadline("Имена и цифры репрессий в СССР", UI.siteTagline)), {
    ...size,
    fonts: await ogFonts(),
  });
}
