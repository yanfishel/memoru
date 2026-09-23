/** Share targets as plain URLs (spec §5.1): no SDKs, no third-party scripts. Browser-safe, no imports beyond strings. */
import { firstSentence } from "./sentences";
import { UI } from "./ui-text";

export interface ShareLink {
  key: "telegram" | "whatsapp" | "vk" | "ok" | "x" | "facebook" | "email";
  label: string;
  href: string;
}

export function shareLinks(url: string, text: string): ShareLink[] {
  const S = UI.person.share;
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return [
    { key: "telegram", label: S.telegram, href: `https://t.me/share/url?url=${u}&text=${t}` },
    { key: "whatsapp", label: S.whatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { key: "vk", label: S.vk, href: `https://vk.com/share.php?url=${u}&title=${t}` },
    { key: "ok", label: S.ok, href: `https://connect.ok.ru/offer?url=${u}&title=${t}` },
    { key: "x", label: S.x, href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { key: "facebook", label: S.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "email", label: S.email, href: `mailto:?subject=${t}&body=${encodeURIComponent(`${text}\n${url}`)}` },
  ];
}

/** "Дело 1. " opens each case's sentences when there are several; alone it says nothing worth sharing. */
const CASE_LEAD = new RegExp(`^${UI.person.narrative.caseN(0).replace(".", "\\.").replace("0", "\\d+")}\\s+`);

/** Longest share text used when the narrative has no sentence boundary the rules trust. */
const MAX_SHARE = 200;

/**
 * The name and the first whole sentence of the narrative (spec §5.1), cut at a real sentence end,
 * never inside a place abbreviation ("г. Москва", "р-н, п. Ключевка"). Server-side only.
 */
export function shareText(name: string, narrativeText: string): string {
  const text = narrativeText.replace(CASE_LEAD, "").trim();
  if (!text) return name;
  let first = firstSentence(text) ?? text;
  if (first.length > MAX_SHARE) first = `${first.slice(0, MAX_SHARE - 1).trimEnd()}…`;
  return `${name}. ${first}`;
}
