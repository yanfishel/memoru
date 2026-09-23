import { describe, expect, it } from "vitest";
import { ogClip, pageMetadata } from "../../../src/lib/metadata";
import { websiteJsonLd } from "../../../src/lib/site-jsonld";
import { UI } from "../../../src/lib/ui-text";

describe("pageMetadata", () => {
  it("spells the site suffix into the Open Graph title, which has no template of its own", () => {
    const meta = pageMetadata({ title: "Поиск", description: "d", path: "/search" });
    expect(meta.title).toBe("Поиск");
    expect(meta.openGraph?.title).toBe("Поиск — MEMOru");
    expect(meta.twitter?.title).toBe("Поиск — MEMOru");
  });

  it("uses the site's own title where a page has none, which is the home page", () => {
    const meta = pageMetadata({ description: "d", path: "/" });
    expect(meta.title).toBeUndefined();
    expect(meta.openGraph?.title).toBe(UI.siteTitle);
  });

  it("carries the site-wide Open Graph fields every time, since Next replaces the block rather than merging it", () => {
    for (const path of ["/", "/about", "/search"]) {
      const og = pageMetadata({ description: "d", path }).openGraph;
      expect(og).toMatchObject({ siteName: "MEMOru", locale: "ru_RU", url: path });
      // `Metadata["twitter"]` is a union of card shapes, so the field needs narrowing to be read.
      expect((pageMetadata({ description: "d", path }).twitter as { card?: string }).card).toBe("summary_large_image");
    }
  });

  it("makes the canonical path the page's own, and keeps query-driven pages out of the index", () => {
    expect(pageMetadata({ description: "d", path: "/explore" }).alternates?.canonical).toBe("/explore");
    expect(pageMetadata({ description: "d", path: "/explore" }).robots).toBeUndefined();
    expect(pageMetadata({ description: "d", path: "/explore", index: false }).robots).toEqual({ index: false, follow: true });
  });
});

describe("websiteJsonLd", () => {
  it("offers a name search from the search engine's own listing", () => {
    const ld = websiteJsonLd("https://example.org");
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.url).toBe("https://example.org/");
    expect(ld.potentialAction).toEqual({
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: "https://example.org/search?q={search_term_string}" },
      "query-input": "required name=search_term_string",
    });
  });

  it("never doubles the slash, whatever SITE_URL ends with", () => {
    expect(websiteJsonLd("https://example.org/").url).toBe("https://example.org/");
  });

  it("names the site as itself, not as the database it presents", () => {
    const ld = websiteJsonLd("https://example.org");
    expect(ld.name).toBe("MEMOru");
    expect(JSON.stringify(ld)).not.toMatch(/^"Открытый список/);
    expect(String(ld.alternateName)).not.toMatch(/^Открытый список/);
  });
});

describe("ogClip", () => {
  it("leaves a line that already fits, whitespace tidied", () => {
    expect(ogClip("  Сафронов   Илья Федорович ", 40)).toBe("Сафронов Илья Федорович");
  });

  it("cuts at a word boundary, because a name cut mid-syllable reads as a bug", () => {
    expect(ogClip("ЧО, Троицкий р-н, посёлок Ключевка", 20)).toBe("ЧО, Троицкий р-н…");
  });

  it("falls back to a hard cut when one word is longer than the whole allowance", () => {
    expect(ogClip("Вышеупомянутыйдлинныйтопоним", 12)).toBe("Вышеупомяну…");
  });
});
