import { createReadStream, readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";

const FIXTURE = "data/fixtures/pages.xml";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
afterAll(() => pool.end());

describe("pipeline on sampled real pages", () => {
  it("imports and normalizes every sampled page without errors", async () => {
    const pageCount = (readFileSync(FIXTURE, "utf8").match(/<page>/g) ?? []).length;
    const imported = await importDump(pool, readDumpPages(createReadStream(FIXTURE)));
    expect(imported).toEqual({ namespace0Pages: pageCount, imported: pageCount, skippedNoFormular: 0, errors: 0 });

    const normalized = await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
    expect(normalized.persons).toBe(pageCount);
    expect(normalized.errors).toBe(0);

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person WHERE case_count >= 2`);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
