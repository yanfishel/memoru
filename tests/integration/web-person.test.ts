import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
// loadPerson resolves the schema through getActiveServing() (DATABASE_URL), read at module level,
// so it is set before the dynamic import below.
process.env.DATABASE_URL = url;
const pool = createPool(url);

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await buildServing(pool, { buildId: "20260917_person", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-17" });
});
afterAll(() => pool.end());

describe("loadPerson", () => {
  it("loads a person with cases and labels", async () => {
    const { loadPerson } = await import("../../src/lib/person");
    const data = await loadPerson(101);
    expect(data?.person).toMatchObject({ id: 101, surname: "Сафронов", givenName: "Илья", openlistTitle: "Сафронов Илья Федорович (1892)" });
    expect(data?.cases.map((c) => c.n)).toEqual([1]);
    expect(data?.labels.get("sex")?.get("m")?.labelRu.length).toBeGreaterThan(0);
    expect(data?.dataDate).toBe("2026-09-17");
    expect(Array.isArray(data?.similar)).toBe(true);
  });
  it("returns null for a missing id", async () => {
    const { loadPerson } = await import("../../src/lib/person");
    expect(await loadPerson(999)).toBeNull();
  });
});
