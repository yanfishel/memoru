import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { createSearchClient } from "../../scripts/etl/search/client";
import { buildServing, readServingSlot } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { activateBuild } from "../../scripts/etl/serving/slot";

const url = process.env.TEST_DATABASE_URL;
const meiliUrl = process.env.TEST_MEILI_URL;
const meiliKey = process.env.MEILI_MASTER_KEY;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
if (!meiliUrl || !meiliKey) throw new Error("TEST_MEILI_URL and MEILI_MASTER_KEY must be set");
const pool = createPool(url);
const searchClient = createSearchClient({ host: meiliUrl, apiKey: meiliKey });
const labels = loadLabels("data/labels.csv");
/** A serving schema no build ever activated: pruning by lineage must never touch it. */
const UNRELATED_SCHEMA = "serving_20260101_unrelated";
/** The index a build registers for build 20260916_test, displaced when build 20260918_test lands. */
const DISPLACED_INDEX = "people_20260916_test";

async function dropTestIndexes() {
  const { results } = await searchClient.getIndexes({ limit: 1000 });
  for (const index of results) {
    if (index.uid.startsWith("people_2026") && index.uid.includes("_test")) await searchClient.deleteIndex(index.uid).waitTask();
  }
}

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await pool.query(`CREATE SCHEMA ${UNRELATED_SCHEMA}`);
  await dropTestIndexes();
});
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${UNRELATED_SCHEMA} CASCADE`);
  await dropTestIndexes();
  await pool.end();
});

describe("buildServing", () => {
  it("returns null before the slot table exists", async () => {
    expect(await readServingSlot(pool)).toBeNull();
  });

  it("builds the schema, derived columns, labels, aggregates and build info", async () => {
    const result = await buildServing(pool, { buildId: "20260916_test", labels, dataDate: "2026-09-16" });
    expect(result).toMatchObject({ schema: "serving_20260916_test", persons: 2, cases: 2, droppedSchemas: [] });

    const persons = await pool.query(
      `SELECT id, age_at_arrest, age_at_arrest_bucket, age_at_death_bucket, rehabilitated
         FROM serving_20260916_test.person ORDER BY id`,
    );
    // Fixture note (tests/fixtures/mini-dump.xml): page 103 carries
    // "дата реабилитации 1=30.06.1961", so its case has a rehab_year and the
    // person is rehabilitated = true. The brief's draft expectation of
    // `rehabilitated: false` for id 103 did not match the fixture; adjusted here
    // per the task instructions (fixture wins over the brief's draft numbers).
    expect(persons.rows).toEqual([
      { id: 101, age_at_arrest: 46, age_at_arrest_bucket: "45-54", age_at_death_bucket: "unknown", rehabilitated: true },
      { id: 103, age_at_arrest: 35, age_at_arrest_bucket: "35-44", age_at_death_bucket: "35-44", rehabilitated: true },
    ]);

    const sex = await pool.query(`SELECT key, count FROM serving_20260916_test.agg_dimension WHERE dimension = 'sex' ORDER BY key`);
    expect(sex.rows).toEqual([{ key: "m", count: 2 }]);
    const years = await pool.query(`SELECT key, count FROM serving_20260916_test.agg_dimension WHERE dimension = 'arrest_year' ORDER BY key`);
    expect(years.rows).toEqual([{ key: "1938", count: 2 }]);

    const summary = await pool.query(`SELECT key, value::int AS value FROM serving_20260916_test.agg_summary ORDER BY key`);
    expect(Object.fromEntries(summary.rows.map((r) => [r.key, r.value]))).toEqual({
      // executed_confirmed: person 103 is the fixture's only case with both a first sentence of
      // "vmn" and a recorded execution (person 101 was sentenced to 10 years ITL instead).
      persons: 2, cases: 2, executed: 1, executed_confirmed: 1, died: 0, rehabilitated: 2, with_arrest_year: 2, multi_case: 0,
    });

    const label = await pool.query(`SELECT label_ru FROM serving_20260916_test.code_label WHERE field = 'sex' AND code = 'm'`);
    expect(label.rows[0].label_ru.length).toBeGreaterThan(0);

    const info = await pool.query(`SELECT value FROM serving_20260916_test.build_info WHERE key = 'build'`);
    expect(info.rows[0].value).toMatchObject({ buildId: "20260916_test", schema: "serving_20260916_test", dataDate: "2026-09-16", persons: 2, cases: 2 });

    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260916_test", previousSchema: null });

    // CREATE TABLE ... AS SELECT drops NOT NULL from every source column; serving.sql
    // must restore it for every column staging-normalized.sql declares NOT NULL, plus
    // the computed columns. Assert the actual set in the database, not just the DDL text.
    const notNullPerson = await pool.query(
      `SELECT a.attname FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'serving_20260916_test' AND c.relname = 'person'
          AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull`,
    );
    expect(new Set(notNullPerson.rows.map((r) => r.attname))).toEqual(
      new Set([
        "id",
        "surname",
        "sex",
        "birth_country_code",
        "birth_region_code",
        "source_region_code",
        "residence_region_code",
        "nationality_code",
        "education_code",
        "party_code",
        "death_kind",
        "case_count",
        "first_sentence_type",
        "openlist_title",
        "age_at_arrest_bucket",
        "age_at_death_bucket",
        "rehabilitated",
      ]),
    );

    const notNullPersonCase = await pool.query(
      `SELECT a.attname FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'serving_20260916_test' AND c.relname = 'person_case'
          AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull`,
    );
    expect(new Set(notNullPersonCase.rows.map((r) => r.attname))).toEqual(new Set(["person_id", "n", "sentence_type"]));
  });

  it("keeps the previous schema on the next build and prunes older ones", async () => {
    // Register an index for build 20260916_test, as `etl index` would while it is still
    // active: the pairing rule then carries it into previous_index through the 20260917_test
    // build, so the 20260918_test build below displaces it along with its schema.
    await searchClient.createIndex(DISPLACED_INDEX, { primaryKey: "id" }).waitTask();
    await activateBuild(pool, { index: DISPLACED_INDEX });
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260916_test", searchIndex: DISPLACED_INDEX });

    await buildServing(pool, { buildId: "20260917_test", labels, dataDate: "2026-09-17" });
    expect(await readServingSlot(pool)).toMatchObject({
      activeSchema: "serving_20260917_test",
      previousSchema: "serving_20260916_test",
      previousIndex: DISPLACED_INDEX,
    });

    const third = await buildServing(pool, { buildId: "20260918_test", labels, dataDate: "2026-09-18", searchClient });
    expect(third.droppedSchemas).toEqual(["serving_20260916_test"]);
    const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%' ORDER BY 1`);
    // Only the schemas this lineage displaced are dropped: a serving_% schema the slot
    // never named belongs to someone else and survives every build.
    expect(rows.map((r) => r.nspname)).toEqual([UNRELATED_SCHEMA, "serving_20260917_test", "serving_20260918_test"]);

    // The index tied to the displaced schema is pruned along with it, since a searchClient
    // was passed: `aggregate` now cleans up the orphaned index Plan 2a deferred.
    const { results } = await searchClient.getIndexes({ limit: 1000 });
    expect(results.map((i) => i.uid)).not.toContain(DISPLACED_INDEX);
  });

  it("refuses to rebuild the active build without force", async () => {
    await expect(buildServing(pool, { buildId: "20260918_test", labels, dataDate: "2026-09-18" })).rejects.toThrow(
      /20260918_test is the active build: pass --force/,
    );
  });

  it("rebuilding the active build id keeps previous_schema and the index pairing", async () => {
    await pool.query(`UPDATE public.serving_slot SET search_index = 'people_20260918_test', previous_index = 'people_20260917_test' WHERE id = 1`);
    const rebuild = await buildServing(pool, { buildId: "20260918_test", labels, dataDate: "2026-09-18", force: true });
    expect(rebuild.droppedSchemas).toEqual([]);
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: "serving_20260918_test",
      previousSchema: "serving_20260917_test",
      searchIndex: "people_20260918_test",
      previousIndex: "people_20260917_test",
    });
  });

  it("moves the search index with its schema and leaves the new build without one", async () => {
    // An index is built from one schema and only ever describes that schema, so when the
    // active schema moves, its index moves with it and the new build has none until
    // `etl index` runs.
    await buildServing(pool, { buildId: "20260919_test", labels, dataDate: "2026-09-19" });
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: "serving_20260919_test",
      previousSchema: "serving_20260918_test",
      searchIndex: null,
      previousIndex: "people_20260918_test",
    });
    expect(await pool.query(`SELECT to_regnamespace('serving_20260917_test') IS NULL AS gone`)).toMatchObject({
      rows: [{ gone: true }],
    });
  });

  it("names the codes that lack a label", async () => {
    const without = labels.filter((l) => !(l.field === "sex" && l.code === "m"));
    await expect(buildServing(pool, { buildId: "20260920_test", labels: without, dataDate: null })).rejects.toThrow(/sex\/m/);
  });

  it("rolls the build back when an aggregate key has no label", async () => {
    const { rows } = await pool.query(
      `SELECT dimension, key FROM serving_20260919_test.agg_dimension
        WHERE dimension IN ('nationality', 'education', 'party', 'birth_country', 'birth_region', 'residence_region', 'source_region')
          AND key NOT IN ('unknown', 'unrecognized')
        ORDER BY dimension, key LIMIT 1`,
    );
    const { dimension, key } = rows[0] as { dimension: string; key: string };
    // An empty dictionary directory hides the code from the pre-flight check, which only
    // knows the codes the dictionaries and the code rules can produce. The in-transaction
    // check reads the built aggregates themselves, so it catches the code anyway.
    const emptyDicts = mkdtempSync(join(tmpdir(), "memoru-dicts-"));
    try {
      const without = labels.filter((l) => !(l.field === dimension && l.code === key));
      await expect(
        buildServing(pool, { buildId: "20260921_test", labels: without, dataDate: null, dictsDir: emptyDicts }),
      ).rejects.toThrow(`${dimension}/${key}`);
    } finally {
      rmSync(emptyDicts, { recursive: true, force: true });
    }
    expect(await pool.query(`SELECT to_regnamespace('serving_20260921_test') IS NULL AS gone`)).toMatchObject({
      rows: [{ gone: true }],
    });
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260919_test" });
  });

  it("refuses incomplete labels and an empty staging", async () => {
    await expect(buildServing(pool, { buildId: "20260922_test", labels: [], dataDate: null })).rejects.toThrow(/labels/);
    await pool.query("TRUNCATE staging.person");
    await expect(buildServing(pool, { buildId: "20260922_test", labels, dataDate: null })).rejects.toThrow(/staging.person is empty/);
  });
});
