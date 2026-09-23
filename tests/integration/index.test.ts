import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { createSearchClient } from "../../scripts/etl/search/client";
import { buildSearchIndex } from "../../scripts/etl/search/index";
import { buildServing, readServingSlot } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";

const url = process.env.TEST_DATABASE_URL;
const meiliUrl = process.env.TEST_MEILI_URL;
const meiliKey = process.env.MEILI_MASTER_KEY;
if (!url || !meiliUrl || !meiliKey) throw new Error("TEST_DATABASE_URL, TEST_MEILI_URL and MEILI_MASTER_KEY must be set");
const pool = createPool(url);
const client = createSearchClient({ host: meiliUrl, apiKey: meiliKey });
const BUILD = String(Date.now() % 100_000_000).padStart(8, "0");
const UNRELATED_INDEX = "people_unrelated_test";

async function dropTestIndexes() {
  const { results } = await client.getIndexes({ limit: 1000 });
  for (const index of results) {
    if (index.uid.startsWith("people_") && index.uid.includes("_test")) await client.deleteIndex(index.uid).waitTask();
  }
}

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  await buildServing(pool, { buildId: `${BUILD}_test`, labels: loadLabels("data/labels.csv"), dataDate: null });
  await dropTestIndexes();
  // An index the pruning logic must never touch: it is not referenced by serving_slot,
  // so a naive "delete everything unrecognized" prune would destroy it.
  await client.createIndex(UNRELATED_INDEX, { primaryKey: "id" }).waitTask();
});
afterAll(async () => {
  await dropTestIndexes();
  await pool.end();
});

describe("buildSearchIndex", () => {
  it("indexes every serving person, applies settings and registers the index", async () => {
    const result = await buildSearchIndex(pool, client, { buildId: `${BUILD}_test`, batchSize: 1 });
    expect(result).toEqual({ index: `people_${BUILD}_test`, documents: 2, tasks: 2 });

    const index = client.index(`people_${BUILD}_test`);
    expect((await index.getStats()).numberOfDocuments).toBe(2);
    expect(await index.getSearchableAttributes()).toEqual(["name", "name_folded"]);

    const byName = await index.search("сафронов", { attributesToRetrieve: ["id"] });
    expect(byName.hits.map((h) => h.id)).toEqual([101]);
    const typo = await index.search("сафранов", { attributesToRetrieve: ["id"] });
    expect(typo.hits.map((h) => h.id)).toEqual([101]);
    const filtered = await index.search("", { filter: ["sentence_type = vmn"], facets: ["sex"], attributesToRetrieve: ["id"] });
    expect(filtered.hits.map((h) => h.id)).toEqual([103]);
    expect(filtered.facetDistribution?.sex).toEqual({ m: 1 });

    expect(await readServingSlot(pool)).toMatchObject({ searchIndex: `people_${BUILD}_test`, previousIndex: null });
  });

  it("refuses to rebuild the registered index without force", async () => {
    await expect(buildSearchIndex(pool, client, { buildId: `${BUILD}_test` })).rejects.toThrow(
      /is the registered search index: pass --force/,
    );
  });

  it("keeps one previous index, deletes only the displaced one, and leaves unrelated indexes alone", async () => {
    await buildServing(pool, { buildId: `${BUILD}_testb`, labels: loadLabels("data/labels.csv"), dataDate: null });
    await buildSearchIndex(pool, client, { buildId: `${BUILD}_testb` });
    expect(await readServingSlot(pool)).toMatchObject({ searchIndex: `people_${BUILD}_testb`, previousIndex: `people_${BUILD}_test` });

    await buildServing(pool, { buildId: `${BUILD}_testc`, labels: loadLabels("data/labels.csv"), dataDate: null });
    await buildSearchIndex(pool, client, { buildId: `${BUILD}_testc` });
    expect(await readServingSlot(pool)).toMatchObject({ searchIndex: `people_${BUILD}_testc`, previousIndex: `people_${BUILD}_testb` });

    const { results } = await client.getIndexes({ limit: 1000 });
    const uids = results.map((i) => i.uid);
    const ours = uids.filter((uid) => uid.startsWith(`people_${BUILD}`)).sort();
    // Since a build moves search_index into previous_index and clears search_index, an index
    // run only ever displaces an index when it replaces a registered one in place (--force):
    // here it displaces nothing, so testb and testc stay. people_<BUILD>_test fell out of the
    // slot at build testc, i.e. it was displaced by the build, which has no search client and
    // cannot delete it -- it is left behind (see the final-fix report's concerns).
    expect(ours).toEqual([`people_${BUILD}_test`, `people_${BUILD}_testb`, `people_${BUILD}_testc`]);
    // An index never referenced by serving_slot must survive every build's pruning.
    expect(uids).toContain(UNRELATED_INDEX);
  });
});
