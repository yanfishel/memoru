import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { GET } from "../../src/app/api/health/route";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
const originalDatabaseUrl = process.env.DATABASE_URL;

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await buildServing(pool, { buildId: "20260919_health", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-19" });
  // The route resolves its own pool from DATABASE_URL; point it at the fixture database.
  process.env.DATABASE_URL = url;
});

afterAll(async () => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  await pool.end();
});

describe("GET /api/health", () => {
  it("reports the live build, so a deploy can be checked without opening a page", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; schema: string; index: string | null; dataDate: string | null };
    expect(body).toMatchObject({ ok: true, schema: "serving_20260919_health", dataDate: "2026-09-19" });
  });

  it("answers 503 rather than 500 when there is nothing to serve, and leaks no connection string", async () => {
    await pool.query(`DELETE FROM public.serving_slot`);
    try {
      const response = await GET();
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toBe(JSON.stringify({ ok: false }));
      expect(text).not.toContain("postgres://");
    } finally {
      await buildServing(pool, { buildId: "20260919_health2", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-19" });
    }
  });
});
