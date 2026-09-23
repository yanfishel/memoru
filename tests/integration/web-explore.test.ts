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

const url = process.env.TEST_DATABASE_URL;
const meiliUrl = process.env.TEST_MEILI_URL;
const meiliKey = process.env.MEILI_MASTER_KEY;
if (!url || !meiliUrl || !meiliKey) throw new Error("TEST_DATABASE_URL, TEST_MEILI_URL and MEILI_MASTER_KEY must be set");
// loadExplore resolves the index through getActiveServing() (DATABASE_URL) and searchPeople's default
// client reads MEILI_URL: both are read at module level, so they are set before the dynamic import below.
process.env.DATABASE_URL = url;
process.env.MEILI_URL = meiliUrl;

const pool = createPool(url);
const client = createSearchClient({ host: meiliUrl, apiKey: meiliKey });
const BUILD = "20260916_expl";
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

describe("loadExplore", () => {
  it("loads the first view from the URL", async () => {
    const { loadExplore } = await import("../../src/lib/explore");
    const data = await loadExplore(new URLSearchParams("sentence_type=vmn"));
    expect(data.filters.codes.sentence_type).toEqual(["vmn"]);
    if (data.result.unavailable) throw new Error("search unavailable");
    expect(data.result.total).toBe(1);
    expect(new Map(data.labels).has("sex")).toBe(true);
  });

  // The regression this guards: id 101 (Сафронов) is russian, id 103 (Сверкот) is german. Filtering on
  // one nationality makes Meilisearch's own facetDistribution report only that nationality — a filtered
  // first render (reload, shared link, Back/Forward) would otherwise be the only "baseline" the client
  // ever sees, collapsing the popover to the current selection (see src/lib/explore.ts's loadExplore).
  it("carries an unfiltered baseline alongside a filtered result, so a sibling value survives", async () => {
    const { loadExplore } = await import("../../src/lib/explore");
    const data = await loadExplore(new URLSearchParams("nationality=russian"));
    if (data.result.unavailable) throw new Error("search unavailable");
    expect(data.result.facets.nationality_code).toEqual({ russian: 1 });
    expect(data.baselineFacets?.nationality_code).toEqual({ russian: 1, german: 1 });
  });

  it("uses the live result as its own baseline when the URL selects nothing", async () => {
    const { loadExplore } = await import("../../src/lib/explore");
    const data = await loadExplore(new URLSearchParams());
    if (data.result.unavailable) throw new Error("search unavailable");
    expect(data.baselineFacets).toEqual(data.result.facets);
  });
});
