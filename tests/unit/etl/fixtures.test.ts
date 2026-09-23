import { describe, expect, it } from "vitest";
import { Reservoir, dedupeByHighestRevId, renderDumpXml } from "../../../scripts/etl/fixtures";
import { readDumpPages, type DumpPage } from "../../../scripts/etl/dump/read-dump";

function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("Reservoir", () => {
  it("keeps every item when there are fewer than the size", () => {
    const r = new Reservoir<number>(5);
    [1, 2, 3].forEach((n) => r.offer(n));
    expect(r.items()).toEqual([1, 2, 3]);
  });

  it("keeps exactly size items and replaces with the given random source", () => {
    // Item 3 (index 2): j = floor(0.1 * 3) = 0 -> replaces slot 0.
    // Item 4 (index 3): j = floor(0.9 * 4) = 3 -> not kept.
    const r = new Reservoir<number>(2, sequenceRandom([0.1, 0.9]));
    [1, 2, 3, 4].forEach((n) => r.offer(n));
    expect(r.items()).toEqual([3, 2]);
  });
});

describe("dedupeByHighestRevId", () => {
  it("keeps only the block with the highest revId for a repeated page id", () => {
    // Mirrors the real dump: the same page id appears in scattered blocks; the
    // first-seen block is not necessarily the one with the highest revId.
    const pages: DumpPage[] = [
      { pageId: 201, title: "A new", revId: 2002, revTimestamp: "2022-01-01T00:00:00Z", text: "new" },
      { pageId: 202, title: "B", revId: 1004, revTimestamp: "2020-01-01T00:00:00Z", text: "b" },
      { pageId: 201, title: "A old", revId: 1002, revTimestamp: "2019-01-01T00:00:00Z", text: "old" },
    ];
    const result = dedupeByHighestRevId(pages);
    expect(result).toHaveLength(2);
    const survivor = result.find((p) => p.pageId === 201);
    expect(survivor).toEqual(pages[0]);
  });

  it("keeps every page id when there are no duplicates", () => {
    const pages: DumpPage[] = [
      { pageId: 1, title: "A", revId: 10, revTimestamp: "2020-01-01T00:00:00Z", text: "a" },
      { pageId: 2, title: "B", revId: 20, revTimestamp: "2020-01-01T00:00:00Z", text: "b" },
    ];
    expect(dedupeByHighestRevId(pages)).toEqual(pages);
  });
});

describe("renderDumpXml", () => {
  it("round-trips through readDumpPages, escaping XML characters", async () => {
    const pages: DumpPage[] = [
      {
        pageId: 7,
        title: "Иванов Иван & Ко <1>",
        revId: 70,
        revTimestamp: "2022-01-01T00:00:00Z",
        text: "{{Формуляр|пол=мужчина}}\n[[Категория:A & B]] <br>",
      },
    ];
    const xml = renderDumpXml(pages);
    const back: DumpPage[] = [];
    for await (const p of readDumpPages([xml])) back.push(p);
    expect(back).toEqual(pages);
  });
});
