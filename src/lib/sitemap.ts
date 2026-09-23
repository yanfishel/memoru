/**
 * Sitemap chunking and rendering (spec §6.1). A chunk covers 50,000 consecutive page ids, so it can never
 * hold more than the 50,000 URLs a sitemap allows and each one is a single primary-key range scan; ids are
 * ~83 % dense in the current build, so most chunks are nearly full. No imports: route handlers and tests share it.
 */
export const SITEMAP_CHUNK_IDS = 50_000;

export function sitemapChunkCount(maxId: number | null): number {
  return maxId === null ? 0 : Math.floor(maxId / SITEMAP_CHUNK_IDS) + 1;
}

export function sitemapChunkRange(chunk: number): { from: number; to: number } {
  return { from: chunk * SITEMAP_CHUNK_IDS, to: (chunk + 1) * SITEMAP_CHUNK_IDS - 1 };
}

export function parseSitemapFile(file: string): number | null {
  const match = /^(0|[1-9]\d{0,5})\.xml$/.exec(file);
  return match ? Number(match[1]) : null;
}

const XML_ESCAPES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

export function renderSitemapIndex(locs: string[]): string {
  const items = locs.map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>\n`).join("");
  return `${HEAD}<sitemapindex ${NS}>\n${items}</sitemapindex>\n`;
}

export function renderUrlSet(entries: Array<{ loc: string; lastmod: string | null }>): string {
  const items = entries
    .map((e) => `<url><loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : ""}</url>\n`)
    .join("");
  return `${HEAD}<urlset ${NS}>\n${items}</urlset>\n`;
}
