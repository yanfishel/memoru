import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { getBuildInfo, getCases, getDimension, getLabels, getPerson, getSummary } from "../../src/db/queries";
import { resolveServing } from "../../src/db/serving";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  await buildServing(pool, { buildId: "20260916_qtest", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-16" });
});
afterAll(() => pool.end());

describe("serving queries", () => {
  it("resolves the active schema and reads summary, dimensions, labels and build info", async () => {
    const s = await resolveServing(pool);
    expect(s.schema).toBe("serving_20260916_qtest");

    expect(await getSummary(s)).toMatchObject({ persons: 2, cases: 2, executed: 1 });
    expect(await getDimension(s, "sex")).toEqual([{ key: "m", count: 2 }]);
    expect((await getLabels(s)).get("sex")?.get("m")?.labelRu.length).toBeGreaterThan(0);
    expect(await getBuildInfo(s)).toEqual({ buildId: "20260916_qtest", dataDate: "2026-09-16", persons: 2, cases: 2 });
  });

  it("reads a person with cases and returns null for a missing id", async () => {
    const s = await resolveServing(pool);
    const person = await getPerson(s, 103);
    expect(person).toMatchObject({ id: 103, surname: "Сверкот", deathKind: "executed", ageAtArrestBucket: "35-44" });
    const cases = await getCases(s, 103);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ n: 1, sentenceType: "vmn" });
    expect(await getPerson(s, 999)).toBeNull();
  });

  it("follows the slot when it changes", async () => {
    await buildServing(pool, { buildId: "20260917_qtest", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-17" });
    const s = await resolveServing(pool);
    expect(s.schema).toBe("serving_20260917_qtest");
  });
});
