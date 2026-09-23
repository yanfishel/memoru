import { join, resolve } from "node:path";
import type pg from "pg";
import type { Meilisearch } from "meilisearch";
import type { EtlConfig } from "../config";
import { indexDocuments, readDocumentsJsonl } from "../search/documents-io";
import { assertBuildId, searchIndexName, servingSchemaName } from "../serving/build-id";
import { activateBuild, ensureServingSlot, pruneBuilds, readServingSlot, swapBack, type ServingSlot } from "../serving/slot";
import { documentsFileName, dumpFileName, readManifest, verifyChecksums } from "./manifest";
import { runPgTool, toolPath } from "./pg-tools";

type PublishConfig = Pick<
  EtlConfig,
  "databaseUrl" | "pgTools" | "pgToolsArtifactsDir" | "artifactsDir" | "revalidateUrl" | "revalidateSecret" | "meiliTaskTimeoutMs"
>;

export interface PublishResult {
  schema: string;
  index: string;
  persons: number;
  cases: number;
  documents: number;
  previousSchema: string | null;
  pruned: { schemas: string[]; indexes: string[] };
  revalidated: boolean;
}

export interface PublishArtifactsOptions {
  buildId: string;
  /** Host directory the artifacts were shipped to; pairs with `toolsFrom`. */
  from?: string;
  /** The same directory as pg_restore sees it (it reads the dump itself). */
  toolsFrom?: string;
  /** Replace the previous build (the rollback target) instead of refusing. */
  force?: boolean;
  batchSize?: number;
  onProgress?: (message: string) => void;
}

export async function notifyRevalidate(config: Pick<EtlConfig, "revalidateUrl" | "revalidateSecret">): Promise<boolean> {
  if (!config.revalidateUrl) return false;
  const response = await fetch(config.revalidateUrl, {
    method: "POST",
    headers: config.revalidateSecret ? { "x-revalidate-secret": config.revalidateSecret } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`revalidation returned HTTP ${response.status}`);
  return true;
}

/** The swap already happened: a failed revalidation leaves stale pages, not a broken build,
 * so it is reported and the command still succeeds. */
async function revalidateAfterSwap(config: Pick<EtlConfig, "revalidateUrl" | "revalidateSecret">): Promise<boolean> {
  try {
    return await notifyRevalidate(config);
  } catch (err) {
    console.error(`publish: revalidation failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** The swap already committed, so the new build is live: a failed prune leaves a displaced schema
 * or index behind, which costs disk, not correctness. It is reported and the command still succeeds
 * — no later `publish` can finish the job, so the name goes into the message for a manual drop. */
async function pruneAfterSwap(
  pool: pg.Pool,
  search: Meilisearch,
  before: ServingSlot | null,
  after: ServingSlot,
): Promise<{ schemas: string[]; indexes: string[] }> {
  try {
    return await pruneBuilds(pool, search, before, after);
  } catch (err) {
    console.error(`publish: prune failed: ${err instanceof Error ? err.message : String(err)}`);
    return { schemas: [], indexes: [] };
  }
}

export async function publishArtifacts(
  pool: pg.Pool,
  search: Meilisearch,
  config: PublishConfig,
  options: PublishArtifactsOptions,
): Promise<PublishResult> {
  // pg_restore reads the dump itself, so a custom host directory is useless without the path
  // the tools reach it by; guessing one would restore the wrong file, or none.
  if (options.from !== undefined && options.toolsFrom === undefined) {
    throw new Error("--from requires --tools-from (the same directory as the tools see it)");
  }
  assertBuildId(options.buildId);
  const schema = servingSchemaName(options.buildId);
  const index = searchIndexName(options.buildId);
  const dir = resolve(options.from ?? config.artifactsDir, options.buildId);

  const manifest = await readManifest(dir);
  if (manifest.buildId !== options.buildId || manifest.schema !== schema || manifest.index !== index) {
    throw new Error(`manifest in ${dir} describes build ${manifest.buildId}, not ${options.buildId}`);
  }
  options.onProgress?.("verifying checksums");
  await verifyChecksums(dir, manifest);

  const slot = await readServingSlot(pool);
  if (slot?.activeSchema === schema) throw new Error(`${schema} is already active: nothing to publish`);
  if (slot?.previousSchema === schema && !options.force) {
    throw new Error(`${schema} is the previous build (the rollback target): pass --force to replace it`);
  }
  const exists = (await pool.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = $1`, [schema])).rows[0].n as number;
  if (exists > 0) {
    options.onProgress?.(`dropping leftover ${schema}`);
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  }

  options.onProgress?.(`restoring ${schema}`);
  await runPgTool(config, "pg_restore", [
    `--dbname=${config.databaseUrl}`, "--no-owner", "--no-privileges", "--exit-on-error",
    toolPath(options.toolsFrom ?? config.pgToolsArtifactsDir, options.buildId, dumpFileName(options.buildId)),
  ]);
  const persons = (await pool.query(`SELECT count(*)::int AS n FROM ${schema}.person`)).rows[0].n as number;
  const cases = (await pool.query(`SELECT count(*)::int AS n FROM ${schema}.person_case`)).rows[0].n as number;
  const info = (await pool.query(`SELECT value FROM ${schema}.build_info WHERE key = 'build'`)).rows[0]?.value as { buildId?: string } | undefined;
  if (persons !== manifest.persons || cases !== manifest.cases || info?.buildId !== options.buildId) {
    throw new Error(`restored ${schema} does not match the manifest: persons ${persons}/${manifest.persons}, cases ${cases}/${manifest.cases}, build ${info?.buildId ?? "none"}`);
  }

  // pg_restore brings no planner statistics with it: without ANALYZE the first readers of the
  // new build plan against an empty table. The schema name comes from assertBuildId.
  options.onProgress?.(`analyzing ${schema}`);
  await pool.query(`ANALYZE ${schema}.person`);
  await pool.query(`ANALYZE ${schema}.person_case`);

  options.onProgress?.(`indexing ${index}`);
  const indexed = await indexDocuments(search, index, readDocumentsJsonl(join(dir, documentsFileName(options.buildId)), options.batchSize ?? 20_000), {
    settings: manifest.settings,
    taskTimeoutMs: config.meiliTaskTimeoutMs,
    onProgress: (done) => options.onProgress?.(`indexed ${done}/${manifest.documents}`),
  });
  if (indexed.documents !== manifest.documents) {
    throw new Error(`indexed ${indexed.documents} documents, manifest says ${manifest.documents}`);
  }

  options.onProgress?.("swapping");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureServingSlot(client);
    await activateBuild(client, { schema, index });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const after = (await readServingSlot(pool))!;
  const pruned = await pruneAfterSwap(pool, search, slot, after);
  const revalidated = await revalidateAfterSwap(config);
  return { schema, index, persons, cases, documents: indexed.documents, previousSchema: after.previousSchema, pruned, revalidated };
}

/** `publish --force` drops the rollback target's schema and index before spending ~10 minutes
 * restoring and indexing. If it dies in that window the slot still points at a build that is gone,
 * and swapping back would put the site on a missing schema, so the swap is refused instead. */
async function assertRollbackTargetExists(pool: pg.Pool, search: Meilisearch, slot: ServingSlot): Promise<void> {
  const schema = slot.previousSchema!;
  const present = (await pool.query(`SELECT to_regnamespace($1) IS NOT NULL AS present`, [schema])).rows[0].present as boolean;
  if (!present) throw new Error(`rollback target ${schema} is gone: it is no longer a schema in this database`);
  if (!slot.previousIndex) return;
  const existing = new Set((await search.getIndexes({ limit: 1000 })).results.map((i) => i.uid));
  if (!existing.has(slot.previousIndex)) throw new Error(`rollback target ${slot.previousIndex} is gone: Meilisearch has no such index`);
}

export async function rollbackServing(
  pool: pg.Pool,
  search: Meilisearch,
  config: Pick<EtlConfig, "revalidateUrl" | "revalidateSecret">,
  options: { onProgress?: (message: string) => void },
): Promise<{ slot: ServingSlot; revalidated: boolean }> {
  const current = await readServingSlot(pool);
  if (!current?.previousSchema) throw new Error("no previous build to roll back to");
  await assertRollbackTargetExists(pool, search, current);
  const client = await pool.connect();
  let slot: ServingSlot;
  try {
    await client.query("BEGIN");
    slot = await swapBack(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  options.onProgress?.(`active is now ${slot.activeSchema} / ${slot.searchIndex ?? "no index"}`);
  return { slot, revalidated: await revalidateAfterSwap(config) };
}
