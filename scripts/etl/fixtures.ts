import type { DumpPage } from "./dump/read-dump";

/** Uniform reservoir sampling (Algorithm R). */
export class Reservoir<T> {
  private readonly kept: T[] = [];
  private seen = 0;

  constructor(
    private readonly size: number,
    private readonly random: () => number = Math.random,
  ) {}

  offer(item: T): void {
    if (this.kept.length < this.size) {
      this.kept.push(item);
    } else {
      const j = Math.floor(this.random() * (this.seen + 1));
      if (j < this.size) this.kept[j] = item;
    }
    this.seen++;
  }

  items(): T[] {
    return [...this.kept];
  }
}

/**
 * Collapses pages repeated across separate blocks (same page id, different
 * revision slices — see import.ts / census.ts comments for the real-dump shape),
 * keeping the block with the highest revId for each page id.
 */
export function dedupeByHighestRevId(pages: DumpPage[]): DumpPage[] {
  const byId = new Map<number, DumpPage>();
  for (const page of pages) {
    const existing = byId.get(page.pageId);
    if (!existing || page.revId > existing.revId) byId.set(page.pageId, page);
  }
  return [...byId.values()];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDumpXml(pages: DumpPage[]): string {
  const body = pages
    .map(
      (p) => `  <page>
    <title>${escapeXml(p.title)}</title>
    <ns>0</ns>
    <id>${p.pageId}</id>
    <revision>
      <id>${p.revId}</id>
      <timestamp>${p.revTimestamp}</timestamp>
      <text xml:space="preserve">${escapeXml(p.text)}</text>
    </revision>
  </page>`,
    )
    .join("\n");
  return `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/" version="0.10" xml:lang="ru">\n${body}\n</mediawiki>\n`;
}
