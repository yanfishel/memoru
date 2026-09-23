import { createReadStream } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { computeCoverage } from "../../scripts/etl/check";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages, type DumpPage } from "../../scripts/etl/dump/read-dump";
import { importDump, MAX_RECORDED_ERRORS } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
afterAll(() => pool.end());

/** Synthetic pages with no XML parsing overhead, for exercising the error cap fast. */
async function* syntheticPages(count: number): AsyncGenerator<DumpPage> {
  for (let i = 1; i <= count; i++) {
    yield { pageId: i, title: `Page ${i}`, revId: i, revTimestamp: "2020-01-01T00:00:00Z", text: "irrelevant" };
  }
}

describe("computeCoverage", () => {
  it("reports counts and shares from staging", async () => {
    await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
    await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
    const report = await computeCoverage(pool, "2026-09-16T00:00:00Z");
    expect(report).toMatchObject({ persons: 2, cases: 2, pages: 2, errors: 0 });
    expect(report.fields.sex).toEqual({ known: 2, share: 1 });
    expect(report.fields.birth_region).toEqual({ known: 1, share: 0.5 });
    expect(report.fields.death_year).toEqual({ known: 1, share: 0.5 });
    expect(report.fields.birth_country).toEqual({ known: 2, share: 1 });
    // The mini-dump's Сафронов has "место проживания" (ЧО, ...), which resolves to
    // RU-CHE via the birth_region fallback (ЧО is not in residence_region.csv).
    expect(report.fields.residence_region).toEqual({ known: 1, share: 0.5 });
  });

  it("sums the uncapped import_meta error counts instead of the truncated etl_errors row count", async () => {
    // Controller ruling (Task 12a): staging.etl_errors truncates at MAX_RECORDED_ERRORS,
    // so a systemic failure rate below the 1%-of-pages gate could otherwise hide behind
    // a truncated table. Force a systemic import failure well past the cap and confirm
    // computeCoverage reports the accurate sum of the two import_meta `errors` fields,
    // not count(*) of the capped etl_errors table.
    const total = MAX_RECORDED_ERRORS + 5;
    const parse = (): never => {
      throw new Error("boom");
    };
    await importDump(pool, syntheticPages(total), { parse });
    await normalizeStaging(pool, loadAllDictionaries("data/dicts"));

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.etl_errors`);
    expect(rows[0].n).toBe(MAX_RECORDED_ERRORS);

    const report = await computeCoverage(pool, "2026-09-16T00:00:00Z");
    expect(report.errors).toBe(total);
    expect(report.errors).not.toBe(rows[0].n);
  });

  it("computes pages from rawBlocks (block-level), not the post-dedup imported count", async () => {
    // Controller fix (task 7c round 1): after the page-id dedup, `imported` became a
    // post-dedup, page-level count while `errors` stays block-level, so `imported +
    // errors` mixed units and made the 1%-of-pages gate ~5.5x stricter than intended.
    // dup-dump.xml has 3 raw blocks (page 201 twice, page 202 once) that dedupe to 2
    // rows, with no parse/normalize errors, so the two formulas disagree: 3 vs 2.
    await importDump(pool, readDumpPages(createReadStream("tests/fixtures/dup-dump.xml")), { dumpPath: "dup" });
    await normalizeStaging(pool, loadAllDictionaries("data/dicts"));

    const meta = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'import'`);
    expect(meta.rows[0].value).toMatchObject({ imported: 2, rawBlocks: 3 });

    const report = await computeCoverage(pool, "2026-09-16T00:00:00Z");
    expect(report.errors).toBe(0);
    expect(report.pages).toBe(3); // rawBlocks (3) + errors (0)
    expect(report.pages).not.toBe(2); // the old, wrong imported (2) + errors (0)
  });
});
