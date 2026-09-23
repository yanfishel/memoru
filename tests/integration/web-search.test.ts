import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { createSearchClient } from "../../scripts/etl/search/client";
import { buildSearchIndex } from "../../scripts/etl/search/index";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { parseFilters } from "../../src/lib/filters";
import { findSimilar, searchPeople } from "../../src/lib/search";

const url = process.env.TEST_DATABASE_URL;
const meiliUrl = process.env.TEST_MEILI_URL;
const meiliKey = process.env.MEILI_MASTER_KEY;
if (!url || !meiliUrl || !meiliKey) throw new Error("TEST_DATABASE_URL, TEST_MEILI_URL and MEILI_MASTER_KEY must be set");
const pool = createPool(url);
const client = createSearchClient({ host: meiliUrl, apiKey: meiliKey });
const BUILD = "20260916_web";
const INDEX = `people_${BUILD}`;

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  // Schemas left behind by an earlier run would still answer `resolveServing`, so this build starts
  // from a clean lineage — the same sweep tests/integration/serving.test.ts does.
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await buildServing(pool, { buildId: BUILD, labels: loadLabels("data/labels.csv"), dataDate: null });
  await buildSearchIndex(pool, client, { buildId: BUILD, batchSize: 1 });
});
afterAll(async () => {
  await client.deleteIndex(INDEX).waitTask();
  await pool.end();
});

describe("searchPeople", () => {
  it("returns hits, paging and facets for a filter", async () => {
    const result = await searchPeople(parseFilters(new URLSearchParams("sentence_type=vmn")), { client, indexName: INDEX });
    if (result.unavailable) throw new Error(result.message);
    expect(result.total).toBe(1);
    expect(result.hits).toEqual([
      { id: 103, name: "Сверкот Павел Валентинович", birth_year: 1903, arrest_year: 1938, source_region_code: "RU-BA", sentence_type: "vmn", has_photo: true },
    ]);
    expect(result.facets.sex).toEqual({ m: 1 });
    expect(result.facets.sentence_type).toEqual({ vmn: 1 });
    expect(result.pages).toBe(1);
  });

  it("searches names with typo tolerance and ё folding", async () => {
    const byTypo = await searchPeople(parseFilters(new URLSearchParams("q=сафранов")), { client, indexName: INDEX });
    if (byTypo.unavailable) throw new Error(byTypo.message);
    expect(byTypo.hits.map((h) => h.id)).toEqual([101]);
  });

  it("filters rehabilitated persons with an unquoted boolean literal", async () => {
    const rehabilitated = await searchPeople(parseFilters(new URLSearchParams("rehabilitated=true")), { client, indexName: INDEX });
    if (rehabilitated.unavailable) throw new Error(rehabilitated.message);
    expect(rehabilitated.total).toBe(2);
    expect(rehabilitated.hits.map((h) => h.id).sort()).toEqual([101, 103]);

    const notRehabilitated = await searchPeople(parseFilters(new URLSearchParams("rehabilitated=false")), { client, indexName: INDEX });
    if (notRehabilitated.unavailable) throw new Error(notRehabilitated.message);
    expect(notRehabilitated.total).toBe(0);
  });

  it("reports unavailability instead of throwing", async () => {
    const broken = createSearchClient({ host: "http://127.0.0.1:1", apiKey: "x" });
    const result = await searchPeople(parseFilters(new URLSearchParams("")), { client: broken, indexName: INDEX });
    expect(result.unavailable).toBe(true);
  });

  it("sorts by a supported key and reports the sortable keys of the index", async () => {
    const asc = await searchPeople(parseFilters(new URLSearchParams("sort=birth_year")), { client, indexName: INDEX });
    if (asc.unavailable) throw new Error(asc.message);
    const years = asc.hits.map((h) => h.birth_year);
    expect(years).toEqual([...years].sort((a, b) => (a ?? 0) - (b ?? 0)));
    const desc = await searchPeople(parseFilters(new URLSearchParams("sort=birth_year&dir=desc")), { client, indexName: INDEX });
    if (desc.unavailable) throw new Error(desc.message);
    expect(desc.hits.map((h) => h.birth_year)).toEqual([...years].reverse());
    expect(asc.sortable).toEqual(["name", "birth_year", "arrest_year"]);
    expect(asc.hits[0].sentence_type).toMatch(/^[a-z_]+$/);
  });

  it("orders a name search globally, not within relevance buckets", async () => {
    // Both fixture surnames start with "С", so the prefix query matches them; `rankingRules` puts `sort`
    // first, which is what makes the requested order win over relevance.
    const result = await searchPeople(parseFilters(new URLSearchParams("q=С&sort=birth_year&dir=desc")), { client, indexName: INDEX });
    if (result.unavailable) throw new Error(result.message);
    expect(result.hits.length).toBeGreaterThan(1);
    const years = result.hits.map((h) => h.birth_year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("with facetsOnly, returns no hits but the same total and facets as a normal search", async () => {
    const state = parseFilters(new URLSearchParams(""));
    const full = await searchPeople(state, { client, indexName: INDEX });
    const facetsOnly = await searchPeople(state, { client, indexName: INDEX, facetsOnly: true });
    if (full.unavailable || facetsOnly.unavailable) throw new Error("search unavailable");
    expect(facetsOnly.hits).toEqual([]);
    expect(facetsOnly.total).toBe(full.total);
    expect(facetsOnly.facets).toEqual(full.facets);
  });
});

describe("findSimilar", () => {
  it("finds a namesake born within three years and never the person themselves", async () => {
    // The fixture holds two persons; searching for one of them by name with their own birth year finds no one else.
    const none = await findSimilar({ id: 101, surname: "Сафронов", givenName: "Илья", birthYear: 1892 }, { client, indexName: INDEX });
    expect(none).toEqual([]);
    // A synthetic namesake: the query text is the name, the filter is the year window, the exact-name check is in code.
    const self = await findSimilar({ id: 999, surname: "Сафронов", givenName: "Илья", birthYear: 1893 }, { client, indexName: INDEX });
    expect(self.map((h) => h.id)).toEqual([101]);
    expect(await findSimilar({ id: 999, surname: "Сафронов", givenName: "Илья", birthYear: null }, { client, indexName: INDEX })).toEqual([]);
  });
});
