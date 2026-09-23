import { describe, expect, it } from "vitest";
import {
  escapeXml, parseSitemapFile, renderSitemapIndex, renderUrlSet, SITEMAP_CHUNK_IDS, sitemapChunkCount, sitemapChunkRange,
} from "../../../src/lib/sitemap";

describe("chunks", () => {
  it("covers ids 0..maxId in 50,000-id chunks", () => {
    expect(SITEMAP_CHUNK_IDS).toBe(50_000);
    expect(sitemapChunkCount(null)).toBe(0);
    expect(sitemapChunkCount(103)).toBe(1);
    expect(sitemapChunkCount(49_999)).toBe(1);
    expect(sitemapChunkCount(50_000)).toBe(2);
    expect(sitemapChunkCount(3_991_833)).toBe(80);
    expect(sitemapChunkRange(0)).toEqual({ from: 0, to: 49_999 });
    expect(sitemapChunkRange(79)).toEqual({ from: 3_950_000, to: 3_999_999 });
  });
  it("parses the chunk file name", () => {
    expect(parseSitemapFile("0.xml")).toBe(0);
    expect(parseSitemapFile("79.xml")).toBe(79);
    expect(parseSitemapFile("x.xml")).toBeNull();
    expect(parseSitemapFile("1")).toBeNull();
    expect(parseSitemapFile("1.xml.gz")).toBeNull();
    expect(parseSitemapFile("007.xml")).toBeNull();
  });
});

describe("xml", () => {
  it("escapes the five XML characters", () => {
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  });
  it("renders a sitemap index", () => {
    expect(renderSitemapIndex(["https://x.org/sitemap/0.xml"])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "<sitemap><loc>https://x.org/sitemap/0.xml</loc></sitemap>\n</sitemapindex>\n",
    );
  });
  it("renders a url set with an optional lastmod", () => {
    expect(renderUrlSet([{ loc: "https://x.org/person/1-a", lastmod: "2026-09-16" }, { loc: "https://x.org/person/2-b&c", lastmod: null }])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "<url><loc>https://x.org/person/1-a</loc><lastmod>2026-09-16</lastmod></url>\n" +
        "<url><loc>https://x.org/person/2-b&amp;c</loc></url>\n</urlset>\n",
    );
  });
});
