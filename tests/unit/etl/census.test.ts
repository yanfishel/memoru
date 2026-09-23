import { createReadStream } from "node:fs";
import { describe, expect, it } from "vitest";
import { CensusAccumulator } from "../../../scripts/etl/census";
import { readDumpPages, type DumpPage } from "../../../scripts/etl/dump/read-dump";

const meta = { dumpPath: "mini", generatedAt: "2026-09-16T00:00:00Z" };

async function censusOf(acc: CensusAccumulator) {
  for await (const page of readDumpPages(createReadStream("tests/fixtures/mini-dump.xml"))) acc.add(page);
  return acc.report(meta);
}

function page(pageId: number, text: string): DumpPage {
  return { pageId, title: `P ${pageId}`, revId: pageId, revTimestamp: "2020-01-01T00:00:00Z", text };
}

describe("CensusAccumulator", () => {
  it("counts pages, params, cases and categories", async () => {
    const report = await censusOf(new CensusAccumulator());
    expect(report.namespace0Pages).toBe(3);
    expect(report.formularPages).toBe(2);
    expect(report.pagesWithCases).toBe(2);
    expect(report.maxCaseNumber).toBe(1);
    expect(report.params["пол"]).toEqual({
      filled: 2,
      distinctValues: 1,
      distinctCapped: false,
      topValues: [{ value: "мужчина", count: 2 }],
    });
    expect(report.params["приговор N"].filled).toBe(2);
    expect(report.params["приговор 1"]).toBeUndefined();
    expect(report.topCategories).toContainEqual({ value: "Башкирия", count: 1 });
  });

  it("orders top values by count, then value", () => {
    const acc = new CensusAccumulator();
    acc.add(page(1, "{{Формуляр|пол=женщина}}"));
    acc.add(page(2, "{{Формуляр|пол=мужчина}}"));
    acc.add(page(3, "{{Формуляр|пол=мужчина}}"));
    expect(acc.report(meta).params["пол"].topValues).toEqual([
      { value: "мужчина", count: 2 },
      { value: "женщина", count: 1 },
    ]);
  });

  it("stops tracking new distinct values after the cap but keeps counting fills", () => {
    const acc = new CensusAccumulator({ maxDistinctPerParam: 2 });
    for (const [i, v] of ["a", "b", "c", "a"].entries()) acc.add(page(i, `{{Формуляр|x=${v}}}`));
    const stats = acc.report(meta).params["x"];
    expect(stats.filled).toBe(4);
    expect(stats.distinctValues).toBe(2);
    expect(stats.distinctCapped).toBe(true);
    expect(stats.topValues[0]).toEqual({ value: "a", count: 2 });
  });

  it("counts a page id repeated across separate blocks once in formularPages, but every block in formularPageBlocks and namespace0Pages", async () => {
    // Real dump shape: page 201 appears in two separate <page> blocks (scattered,
    // with an unrelated page 202 between them), same as the other blocks it holds
    // only a slice of the revision history. Distinct-id counting must not conflate
    // "how many pages have a Формуляр" with "how many blocks carry one".
    const acc = new CensusAccumulator();
    for await (const p of readDumpPages(createReadStream("tests/fixtures/dup-dump.xml"))) acc.add(p);
    const report = acc.report(meta);
    expect(report.namespace0Pages).toBe(3);
    expect(report.formularPageBlocks).toBe(3);
    expect(report.formularPages).toBe(2);
  });

  it("counts params and categories from a repeated page's first block only, not every block", async () => {
    // dup-dump.xml: page 201's first block (rev 2002, "пол=мужчина", category
    // "Открытый список") is seen before its second block (rev 1002, "пол=женщина",
    // same category). Page 202 (rev 1004, "пол=мужчина") sits between them. The
    // second block for 201 must not contribute to `filled`, topValues or categories
    // — otherwise a page's older, less-complete revisions would inflate coverage
    // stats past what `formularPages` (distinct persons) can bound.
    const acc = new CensusAccumulator();
    for await (const p of readDumpPages(createReadStream("tests/fixtures/dup-dump.xml"))) acc.add(p);
    const report = acc.report(meta);
    expect(report.formularPageBlocks).toBe(3); // all 3 blocks still counted
    expect(report.params["пол"].filled).toBe(2); // only the first-seen block of page 201, plus page 202
    expect(report.params["пол"].topValues).toEqual([{ value: "мужчина", count: 2 }]);
    expect(report.params["приговор N"].topValues).toEqual(
      expect.arrayContaining([
        { value: "20 лет ИТЛ", count: 1 },
        { value: "ВМН (расстрел)", count: 1 },
      ]),
    );
    expect(report.params["приговор N"].filled).toBe(2);
    expect(report.topCategories).toEqual(
      expect.arrayContaining([
        { value: "Открытый список", count: 1 },
        { value: "Все мартирологи", count: 1 },
      ]),
    );
  });

  it("keeps maxCaseNumber below MAX_CASE_NUMBER, treating a larger trailing number as part of the key", () => {
    // Same guard as splitCases (scripts/etl/parse/cases.ts): a numbered key above
    // MAX_CASE_NUMBER is a year embedded in the parameter name (e.g. "место
    // проживания до 1930"), not a case index, and must not raise maxCaseNumber.
    const acc = new CensusAccumulator();
    acc.add(page(1, "{{Формуляр|место проживания до 1930=г. Москва|приговор 5=10 лет ИТЛ}}"));
    const report = acc.report(meta);
    expect(report.maxCaseNumber).toBe(5);
    // The key is still counted (grouped under its "base N" bucket) even though it
    // doesn't move maxCaseNumber — census.ts only gates the max, per the ruling.
    expect(report.params["место проживания до N"].filled).toBe(1);
  });
});
