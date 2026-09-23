import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizePerson } from "../../scripts/etl/normalize/person";
import { normalizeStaging, PERSON_KEYS, CASE_KEYS, toSnake } from "../../scripts/etl/normalize/run";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
const dicts = loadAllDictionaries("data/dicts");

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
});
afterAll(() => pool.end());

describe("normalizeStaging", () => {
  it("fills person and person_case", async () => {
    const stats = await normalizeStaging(pool, dicts, { batchSize: 1 });
    expect(stats).toEqual({ persons: 2, cases: 2, errors: 0 });

    const persons = await pool.query(
      `SELECT id, sex, birth_year, birth_region_code, source_region_code, age_at_arrest, death_kind, first_sentence_type, openlist_title
         FROM staging.person ORDER BY id`,
    );
    expect(persons.rows).toEqual([
      { id: 101, sex: "m", birth_year: 1892, birth_region_code: "RU-CHE", source_region_code: "RU-CHE", age_at_arrest: 46, death_kind: "unknown", first_sentence_type: "itl", openlist_title: "Сафронов Илья Федорович (1892)" },
      { id: 103, sex: "m", birth_year: 1903, birth_region_code: "unrecognized", source_region_code: "RU-BA", age_at_arrest: 35, death_kind: "executed", first_sentence_type: "vmn", openlist_title: "Сверкот Павел Валентинович (1903)" },
    ]);

    const cases = await pool.query(
      `SELECT person_id, n, sentence_type, sentence_years, arrest_date_precision FROM staging.person_case ORDER BY person_id`,
    );
    expect(cases.rows).toEqual([
      { person_id: 101, n: 1, sentence_type: "itl", sentence_years: 10, arrest_date_precision: "f" },
      { person_id: 103, n: 1, sentence_type: "vmn", sentence_years: null, arrest_date_precision: "f" },
    ]);
  });

  it("matches table columns to row keys in order", async () => {
    const { rows } = await pool.query(
      `SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
         FROM information_schema.columns
        WHERE table_schema = 'staging' AND table_name IN ('person', 'person_case')
        GROUP BY table_name ORDER BY table_name`,
    );
    expect(rows).toEqual([
      { table_name: "person", columns: PERSON_KEYS.map(toSnake) },
      { table_name: "person_case", columns: CASE_KEYS.map(toSnake) },
    ]);
  });

  it("is repeatable and records failures", async () => {
    const normalize: typeof normalizePerson = (raw, d) => {
      if (raw.pageId === 103) throw new Error("bad record");
      return normalizePerson(raw, d);
    };
    const stats = await normalizeStaging(pool, dicts, { normalize });
    expect(stats).toEqual({ persons: 1, cases: 1, errors: 1 });
    const errors = await pool.query(`SELECT page_id, reason FROM staging.etl_errors WHERE stage = 'normalize'`);
    expect(errors.rows).toEqual([{ page_id: 103, reason: "Error: bad record" }]);
    const meta = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'normalize'`);
    expect(meta.rows[0].value).toMatchObject({ persons: 1, cases: 1, errors: 1, errorsRecorded: errors.rows.length });
  });
});
