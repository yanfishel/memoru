import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildArtifacts } from "../../scripts/etl/artifacts/build";
import { CHECKSUM_FILE, MANIFEST_FILE, readManifest, verifyChecksums } from "../../scripts/etl/artifacts/manifest";
import { publishArtifacts, rollbackServing } from "../../scripts/etl/artifacts/publish";
import { loadConfig } from "../../scripts/etl/config";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { createSearchClient } from "../../scripts/etl/search/client";
import { buildSearchIndex } from "../../scripts/etl/search/index";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { readServingSlot } from "../../scripts/etl/serving/slot";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
// The artifact tests run pg_dump/pg_restore through PG_TOOLS against the *test* database.
const testMeiliUrl = process.env.TEST_MEILI_URL;
if (!testMeiliUrl) throw new Error("TEST_MEILI_URL is not set");
// Tests use the test database and the test Meilisearch instance (never the dev ones).
// The coverage report is read from a directory of this test's own: the real data/reports holds a
// report for the full database, which the manifest's coverage check would reject for this build.
const reportsDir = ".artifacts/test-reports";
const config = {
  ...loadConfig(), databaseUrl: url, meiliUrl: testMeiliUrl,
  artifactsDir: ".artifacts/test", pgToolsArtifactsDir: "/artifacts/test", reportsDir,
};
const pool = createPool(url);
const search = createSearchClient({ host: config.meiliUrl, apiKey: config.meiliMasterKey });
const BUILD = "20260916_art";

const coverageReport = (persons: number, cases: number) =>
  JSON.stringify({ generatedAt: "2026-09-16T00:00:00.000Z", persons, cases, pages: persons, errors: 0, fields: {} });

beforeAll(async () => {
  rmSync(config.artifactsDir, { recursive: true, force: true });
  rmSync(reportsDir, { recursive: true, force: true });
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "coverage-2026-09-16.json"), coverageReport(2, 2), "utf8");
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  await buildServing(pool, { buildId: BUILD, labels: loadLabels("data/labels.csv"), dataDate: "2026-09-16" });
  await buildSearchIndex(pool, search, { buildId: BUILD, batchSize: 1 });
});
afterAll(async () => {
  await pool.end();
});

describe("buildArtifacts", () => {
  it("writes the dump, the documents, the manifest and the checksums", async () => {
    const { dir, manifest } = await buildArtifacts(pool, config, {});
    expect(dir).toBe(join(config.artifactsDir, BUILD));
    expect(manifest).toMatchObject({ version: 1, buildId: BUILD, schema: `serving_${BUILD}`, index: `people_${BUILD}`, persons: 2, cases: 2, documents: 2 });
    expect(manifest.files.map((f) => f.name).sort()).toEqual([`people_${BUILD}.jsonl.gz`, `serving_${BUILD}.dump`]);
    for (const f of manifest.files) expect(f.bytes).toBeGreaterThan(0);
    expect(existsSync(join(dir, MANIFEST_FILE))).toBe(true);
    expect(readFileSync(join(dir, CHECKSUM_FILE), "utf8").split("\n").filter(Boolean)).toHaveLength(2);
    expect(await readManifest(dir)).toEqual(manifest);
    await expect(verifyChecksums(dir, manifest)).resolves.toBeUndefined();
  });

  it("refuses --out without --tools-out", async () => {
    await expect(buildArtifacts(pool, config, { out: "x" })).rejects.toThrow(/tools-out/);
  });

  it("refuses a coverage report computed from other data", async () => {
    // `check` ran, then the data changed and only `aggregate` was re-run: the newest report on
    // disk describes a different database and must not be shipped as this build's evidence.
    const stale = join(reportsDir, "coverage-2026-09-17.json");
    writeFileSync(stale, coverageReport(3_350_000, 4_000_000), "utf8");
    try {
      await expect(buildArtifacts(pool, config, {})).rejects.toThrow(
        /coverage report coverage-2026-09-17\.json does not match build 20260916_art \(persons 3350000 vs 2/,
      );
    } finally {
      rmSync(stale, { force: true });
    }
    // The matching report is shipped again once the stale one is gone.
    const { manifest } = await buildArtifacts(pool, config, {});
    expect(manifest.coverage).toMatchObject({ persons: 2, cases: 2 });
  });
});

describe("publishArtifacts and rollbackServing", () => {
  it("restores, indexes, verifies and swaps; then rolls back", async () => {
    // Pretend to be the server: forget the build (schema and index) but keep an older build active.
    await buildServing(pool, { buildId: "20260901_art", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-01" });
    await buildSearchIndex(pool, search, { buildId: "20260901_art", batchSize: 1 });
    await pool.query(`DROP SCHEMA IF EXISTS serving_${BUILD} CASCADE`);
    await search.deleteIndex(`people_${BUILD}`).waitTask();
    // A server that never knew this build has no previous pair pointing at it.
    await pool.query(`UPDATE public.serving_slot SET previous_schema = NULL, previous_index = NULL`);
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260901_art", searchIndex: "people_20260901_art", previousSchema: null });

    const result = await publishArtifacts(pool, search, config, { buildId: BUILD, batchSize: 1 });
    expect(result).toMatchObject({ schema: `serving_${BUILD}`, index: `people_${BUILD}`, persons: 2, cases: 2, documents: 2, previousSchema: "serving_20260901_art", revalidated: false });
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: `serving_${BUILD}`, previousSchema: "serving_20260901_art", searchIndex: `people_${BUILD}`, previousIndex: "people_20260901_art",
    });
    const restored = await pool.query(`SELECT count(*)::int AS n FROM serving_${BUILD}.person`);
    expect(restored.rows[0].n).toBe(2);
    expect((await search.index(`people_${BUILD}`).getStats()).numberOfDocuments).toBe(2);
    // The restore leaves no statistics behind: publish must ANALYZE the restored tables.
    const analyzed = await pool.query<{ relname: string; last_analyze: Date | null }>(
      `SELECT relname, last_analyze FROM pg_stat_user_tables WHERE schemaname = $1 ORDER BY relname`,
      [`serving_${BUILD}`],
    );
    for (const table of ["person", "person_case"]) {
      expect(analyzed.rows.find((r) => r.relname === table)?.last_analyze).toBeInstanceOf(Date);
    }

    const back = await rollbackServing(pool, search, config, {});
    expect(back.slot).toMatchObject({ activeSchema: "serving_20260901_art", previousSchema: `serving_${BUILD}` });
  });

  it("refuses --from without --tools-from", async () => {
    await expect(publishArtifacts(pool, search, config, { buildId: BUILD, from: "x" })).rejects.toThrow(/tools-from/);
  });

  it("refuses a corrupted artifact before touching the database", async () => {
    const dir = join(config.artifactsDir, BUILD);
    const dump = join(dir, `serving_${BUILD}.dump`);
    const original = readFileSync(dump);
    try {
      writeFileSync(dump, Buffer.concat([original, Buffer.from("x")]));
      await pool.query(`DROP SCHEMA IF EXISTS serving_${BUILD} CASCADE`);
      await expect(publishArtifacts(pool, search, config, { buildId: BUILD })).rejects.toThrow(/checksum mismatch/);
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'serving_${BUILD}'`);
      expect(rows[0].n).toBe(0);
    } finally {
      writeFileSync(dump, original);
    }
  });

  it("refuses to publish the active build again", async () => {
    // The rollback above made BUILD the previous build, so republishing it needs --force.
    await publishArtifacts(pool, search, config, { buildId: BUILD, batchSize: 1, force: true });
    await expect(publishArtifacts(pool, search, config, { buildId: BUILD })).rejects.toThrow(/already active/);
  });

  it("refuses to replace the rollback target unless forced", async () => {
    await rollbackServing(pool, search, config, {});
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260901_art", previousSchema: `serving_${BUILD}` });
    await expect(publishArtifacts(pool, search, config, { buildId: BUILD })).rejects.toThrow(/rollback target/);
    const forced = await publishArtifacts(pool, search, config, { buildId: BUILD, batchSize: 1, force: true });
    expect(forced).toMatchObject({ schema: `serving_${BUILD}`, previousSchema: "serving_20260901_art" });
  });

  it("refuses to roll back to a build that is gone", async () => {
    // `publish --force` drops the rollback target before restoring; if it dies in that window the
    // slot still names a schema and an index that no longer exist.
    const before = (await readServingSlot(pool))!;
    const away = `gone_${before.previousSchema}`;
    await pool.query(`ALTER SCHEMA ${before.previousSchema} RENAME TO ${away}`);
    try {
      await expect(rollbackServing(pool, search, config, {})).rejects.toThrow(
        new RegExp(`rollback target ${before.previousSchema} is gone`),
      );
    } finally {
      await pool.query(`ALTER SCHEMA ${away} RENAME TO ${before.previousSchema}`);
    }
    // The same refusal when only the index is missing.
    await pool.query(`UPDATE public.serving_slot SET previous_index = 'people_20260901_gone'`);
    await expect(rollbackServing(pool, search, config, {})).rejects.toThrow(/rollback target people_20260901_gone is gone/);
    await pool.query(`UPDATE public.serving_slot SET previous_index = $1`, [before.previousIndex]);
    // The state the scenarios above left is restored, and rolling back works again.
    expect(await readServingSlot(pool)).toEqual(before);
    const back = await rollbackServing(pool, search, config, {});
    expect(back.slot).toMatchObject({ activeSchema: before.previousSchema, previousSchema: before.activeSchema });
  });
});
