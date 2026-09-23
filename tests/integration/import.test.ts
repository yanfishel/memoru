import { createReadStream } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages, type DumpPage } from "../../scripts/etl/dump/read-dump";
import { importDump, MAX_RECORDED_ERRORS } from "../../scripts/etl/import";
import { parseFormular } from "../../scripts/etl/parse/formular";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
afterAll(() => pool.end());

const miniPages = () => readDumpPages(createReadStream("tests/fixtures/mini-dump.xml"));

/** Synthetic pages with no XML parsing overhead, for exercising the error cap fast. */
async function* syntheticPages(count: number): AsyncGenerator<DumpPage> {
  for (let i = 1; i <= count; i++) {
    yield { pageId: i, title: `Page ${i}`, revId: i, revTimestamp: "2020-01-01T00:00:00Z", text: "irrelevant" };
  }
}

describe("importDump", () => {
  it("loads Формуляр pages into staging.person_raw", async () => {
    const stats = await importDump(pool, miniPages(), { dumpPath: "mini" });
    expect(stats).toEqual({ namespace0Pages: 3, imported: 2, skippedNoFormular: 1, errors: 0 });

    const { rows } = await pool.query(
      `SELECT page_id, title, rev_id, params->>'пол' AS sex, params->>'приговор 1' AS sentence, categories
         FROM staging.person_raw ORDER BY page_id`,
    );
    expect(rows).toEqual([
      {
        page_id: 101,
        title: "Сафронов Илья Федорович (1892)",
        rev_id: "1002",
        sex: "мужчина",
        sentence: "10 лет ИТЛ",
        categories: ["Открытый список", "Объединенный государственный архив Челябинской области", "Челябинская обл."],
      },
      {
        page_id: 103,
        title: "Сверкот Павел Валентинович (1903)",
        rev_id: "1004",
        sex: "мужчина",
        sentence: "ВМН (расстрел)",
        categories: ["Все мартирологи", "Книга памяти Республики Башкортостан", "Башкирия"],
      },
    ]);

    const meta = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'import'`);
    expect(meta.rows[0].value).toMatchObject({ dumpPath: "mini", imported: 2 });
  });

  it("is repeatable", async () => {
    await importDump(pool, miniPages());
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
    expect(rows[0].n).toBe(2);
  });

  it("records parse failures in etl_errors without aborting", async () => {
    const parse = (text: string) => {
      if (text.includes("Сверкот") || text.includes("Польша")) throw new Error("boom");
      return parseFormular(text);
    };
    const stats = await importDump(pool, miniPages(), { parse });
    expect(stats).toEqual({ namespace0Pages: 3, imported: 1, skippedNoFormular: 1, errors: 1 });
    const { rows } = await pool.query(`SELECT page_id, stage, reason FROM staging.etl_errors`);
    expect(rows).toEqual([{ page_id: 103, stage: "import", reason: "Error: boom" }]);
  });

  it("respects the page limit", async () => {
    const stats = await importDump(pool, miniPages(), { limit: 1 });
    expect(stats.namespace0Pages).toBe(1);
    expect(stats.imported).toBe(1);
  });

  it("treats a limit of 0 as stop-immediately, not unlimited", async () => {
    // `0 && ...` is falsy, so a naive `options.limit && ...` guard never stops
    // the loop when limit is 0 -- it would scan the whole dump instead.
    const stats = await importDump(pool, miniPages(), { limit: 0 });
    expect(stats.namespace0Pages).toBe(1);
  });

  it("dedupes a page repeated across separate blocks, keeping the highest rev_id", async () => {
    // Real dump shape: page 201 shows up in two scattered <page> blocks (with
    // unrelated page 202 between them); the first block carries the higher rev_id,
    // same as the real dump (ordered newest-revision-first per page-id occurrence).
    const dupPages = () => readDumpPages(createReadStream("tests/fixtures/dup-dump.xml"));
    const stats = await importDump(pool, dupPages(), { dumpPath: "dup" });

    expect(stats.namespace0Pages).toBe(3); // raw blocks, unaffected by dedup
    expect(stats.imported).toBe(2); // deduped: page 201 once, page 202 once

    const { rows } = await pool.query(
      `SELECT page_id, rev_id, params->>'пол' AS sex, params->>'приговор 1' AS sentence
         FROM staging.person_raw WHERE page_id = 201`,
    );
    expect(rows).toEqual([{ page_id: 201, rev_id: "2002", sex: "мужчина", sentence: "20 лет ИТЛ" }]);

    const total = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
    expect(total.rows[0].n).toBe(2);

    const meta = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'import'`);
    expect(meta.rows[0].value).toMatchObject({ imported: 2, rawBlocks: 3 });

    const pk = await pool.query(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'staging.person_raw'::regclass AND contype = 'p'`,
    );
    expect(pk.rows[0].n).toBe(1);
  });

  it("keeps the NOT NULL constraints staging.sql declares after the dedupe swap", async () => {
    // `CREATE TABLE staging.person_raw_dedup AS SELECT ...` (import.ts) does not
    // carry NOT NULL over from the source table; only the later `ADD PRIMARY KEY
    // (page_id)` re-establishes it for that one column. Without an explicit ALTER,
    // normalize's unguarded `parseTitle(row.title)` etc. would blow up on a NULL.
    await importDump(pool, miniPages(), { dumpPath: "mini" });
    const { rows } = await pool.query(
      `SELECT attname, attnotnull FROM pg_attribute
        WHERE attrelid = 'staging.person_raw'::regclass AND attnum > 0 AND NOT attisdropped
        ORDER BY attnum`,
    );
    expect(rows).toEqual([
      { attname: "page_id", attnotnull: true },
      { attname: "title", attnotnull: true },
      { attname: "rev_id", attnotnull: true },
      { attname: "rev_ts", attnotnull: true },
      { attname: "params", attnotnull: true },
      { attname: "categories", attnotnull: true },
    ]);
  });

  it("caps the number of failures recorded in etl_errors on a systemic parse failure", async () => {
    const total = MAX_RECORDED_ERRORS + 5;
    const parse = (): never => {
      throw new Error("boom");
    };
    const stats = await importDump(pool, syntheticPages(total), { parse });
    expect(stats).toEqual({ namespace0Pages: total, imported: 0, skippedNoFormular: 0, errors: total });

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.etl_errors`);
    expect(rows[0].n).toBe(MAX_RECORDED_ERRORS);

    const meta = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'import'`);
    expect(meta.rows[0].value).toMatchObject({ errors: total, errorsRecorded: MAX_RECORDED_ERRORS });
  });
});
