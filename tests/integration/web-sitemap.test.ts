import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { getMaxPersonId, listPersonNames } from "../../src/db/queries";
import { resolveServing } from "../../src/db/serving";
import { sitemapChunkCount, sitemapChunkRange } from "../../src/lib/sitemap";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await buildServing(pool, { buildId: "20260917_sitemap", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-17" });
});
afterAll(() => pool.end());

describe("sitemap queries", () => {
  it("finds the highest id and lists names in an id range in id order", async () => {
    const s = await resolveServing(pool);
    const maxId = await getMaxPersonId(s);
    expect(maxId).toBe(103);
    expect(sitemapChunkCount(maxId)).toBe(1);
    const names = await listPersonNames(s, sitemapChunkRange(0));
    expect(names).toEqual([
      { id: 101, surname: "Сафронов", givenName: "Илья", patronymic: "Федорович" },
      { id: 103, surname: "Сверкот", givenName: "Павел", patronymic: "Валентинович" },
    ]);
    expect(await listPersonNames(s, { from: 104, to: 200 })).toEqual([]);
  });
});
