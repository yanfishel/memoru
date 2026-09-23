import type { Metadata } from "next";
import { UI } from "./ui-text";

export interface PageMeta {
  /** The page's own title, without the site suffix. Omitted on the home page, which is the site. */
  title?: string;
  description: string;
  /** The canonical path, from the site root. Query strings never belong here. */
  path: string;
  type?: "website" | "article" | "profile";
  /** Query-driven pages stay out of the index, matching the rules in robots.ts. */
  index?: boolean;
}

/**
 * One page's metadata, built in one place because Next merges metadata *shallowly*: a page that
 * defines `openGraph` replaces the layout's entire block rather than adding to it, so anything set
 * once at the root — `siteName`, `locale`, the card type — is silently lost by every page that
 * writes its own. Going through this builder is what keeps that from happening one page at a time.
 *
 * The Open Graph title carries the site suffix spelled out, since `title.template` applies to the
 * document title alone and never reaches `og:title`.
 */
export function pageMetadata({ title, description, path, type = "website", index = true }: PageMeta): Metadata {
  const full = title ? `${title} — ${UI.siteName}` : UI.siteTitle;
  return {
    ...(title === undefined ? {} : { title }),
    description,
    alternates: { canonical: path },
    ...(index ? {} : { robots: { index: false, follow: true } }),
    openGraph: { type, locale: "ru_RU", siteName: UI.siteName, title: full, description, url: path },
    twitter: { card: "summary_large_image", title: full, description },
  };
}

/**
 * Cuts a line to fit a social card. Satori has no reliable multi-line ellipsis, so the trimming
 * happens here, at a word boundary where there is one — a name cut mid-syllable reads as a bug, and
 * these are people's names.
 */
export function ogClip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;.]+$/, "")}…`;
}
