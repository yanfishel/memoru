import type pg from "pg";
import type { Meilisearch } from "meilisearch";
import { runSqlFile } from "../db/copy";

export interface ServingSlot {
  activeSchema: string;
  previousSchema: string | null;
  searchIndex: string | null;
  previousIndex: string | null;
}

type Db = pg.Pool | pg.PoolClient;

export async function ensureServingSlot(db: Db): Promise<void> {
  // runSqlFile takes a PoolClient; a Pool runs the file through a checked-out client.
  if ("connect" in db && typeof (db as pg.Pool).connect === "function" && !("release" in db)) {
    const client = await (db as pg.Pool).connect();
    try {
      await runSqlFile(client, "scripts/etl/db/serving-slot.sql");
    } finally {
      client.release();
    }
    return;
  }
  await runSqlFile(db as pg.PoolClient, "scripts/etl/db/serving-slot.sql");
}

export async function readServingSlot(db: Db): Promise<ServingSlot | null> {
  const present = (await db.query(`SELECT to_regclass('public.serving_slot') IS NOT NULL AS present`)).rows[0].present as boolean;
  if (!present) return null;
  const { rows } = await db.query(`SELECT active_schema, previous_schema, search_index, previous_index FROM public.serving_slot WHERE id = 1`);
  const row = rows[0] as { active_schema: string; previous_schema: string | null; search_index: string | null; previous_index: string | null } | undefined;
  if (!row) return null;
  return { activeSchema: row.active_schema, previousSchema: row.previous_schema, searchIndex: row.search_index, previousIndex: row.previous_index };
}

/** Make a build active. See the pairing rule in the Task 1 interfaces: a schema change moves
 * the current index to previous_index and clears search_index unless a new index is given. */
export async function activateBuild(db: Db, build: { schema?: string; index?: string }): Promise<void> {
  const current = await readServingSlot(db);
  if (!current) {
    if (!build.schema) throw new Error("activateBuild: the first activation needs a schema");
    await db.query(`INSERT INTO public.serving_slot (id, active_schema, search_index) VALUES (1, $1, $2)`, [build.schema, build.index ?? null]);
    return;
  }
  const schemaChanges = build.schema !== undefined && build.schema !== current.activeSchema;
  if (schemaChanges) {
    await db.query(
      `UPDATE public.serving_slot SET
         previous_schema = active_schema,
         active_schema   = $1,
         previous_index  = search_index,
         search_index    = $2,
         activated_at    = now()
       WHERE id = 1`,
      [build.schema, build.index ?? null],
    );
    return;
  }
  if (build.index !== undefined) {
    await db.query(
      `UPDATE public.serving_slot SET
         previous_index = CASE WHEN search_index IS NULL OR search_index = $1 THEN previous_index ELSE search_index END,
         search_index   = $1,
         activated_at   = now()
       WHERE id = 1`,
      [build.index],
    );
  }
}

export async function swapBack(db: Db): Promise<ServingSlot> {
  const current = await readServingSlot(db);
  if (!current?.previousSchema) throw new Error("no previous build to roll back to");
  await db.query(
    `UPDATE public.serving_slot SET
       active_schema = previous_schema, previous_schema = active_schema,
       search_index = previous_index, previous_index = search_index,
       activated_at = now()
     WHERE id = 1`,
  );
  return (await readServingSlot(db))!;
}

export async function pruneBuilds(
  pool: pg.Pool,
  client: Meilisearch | null,
  before: ServingSlot | null,
  after: ServingSlot,
): Promise<{ schemas: string[]; indexes: string[] }> {
  // Lineage-based: only what the slot itself displaced is removed. Enumerating every
  // serving_% schema or people_* index would delete builds this slot never registered
  // (another database sharing the Meilisearch instance, a rehearsal, a test run).
  const keepSchemas = new Set([after.activeSchema, after.previousSchema].filter((s): s is string => s !== null));
  const keepIndexes = new Set([after.searchIndex, after.previousIndex].filter((s): s is string => s !== null));
  const displacedSchemas = [before?.activeSchema, before?.previousSchema].filter((s): s is string => !!s && !keepSchemas.has(s));
  const displacedIndexes = [before?.searchIndex, before?.previousIndex].filter((s): s is string => !!s && !keepIndexes.has(s));

  // A failure names the object it could not remove: the caller reports it so an operator can
  // drop it by hand (the prune runs after the swap has committed, see publish's pruneAfterSwap).
  const schemas: string[] = [];
  for (const schema of new Set(displacedSchemas)) {
    if (!/^serving_[0-9]{8}(_[a-z0-9]{1,16})?$/.test(schema)) continue;
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } catch (err) {
      throw new Error(`could not drop ${schema}: ${err instanceof Error ? err.message : String(err)}`);
    }
    schemas.push(schema);
  }
  const indexes: string[] = [];
  if (client) {
    const existing = new Set((await client.getIndexes({ limit: 1000 })).results.map((i) => i.uid));
    for (const uid of new Set(displacedIndexes)) {
      if (!uid.startsWith("people_") || !existing.has(uid)) continue;
      const task = await client.deleteIndex(uid).waitTask({ timeout: 600_000, interval: 500 }).catch((err: unknown) => {
        throw new Error(`could not delete ${uid}: ${err instanceof Error ? err.message : String(err)}`);
      });
      if (task.status !== "succeeded") throw new Error(`Meilisearch delete ${uid} ${task.status}`);
      indexes.push(uid);
    }
  }
  return { schemas, indexes };
}
