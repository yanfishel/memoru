import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type pg from "pg";
import type { Meilisearch } from "meilisearch";
import { copyRows, type CopyValue } from "../db/copy";
import { loadAllDictionaries } from "../normalize/dicts";
import { assertBuildId, servingSchemaName } from "./build-id";
import { DIMENSION_LABEL_FIELD, expectedCodes, missingLabels, type CodeLabel } from "./labels";
import { activateBuild, ensureServingSlot, pruneBuilds, readServingSlot } from "./slot";

export interface BuildOptions {
  buildId: string;
  labels: CodeLabel[];
  dataDate: string | null;
  /** Dictionaries directory, used only to check label completeness. */
  dictsDir?: string;
  /** Rebuild the active build in place; readers stall until COMMIT. */
  force?: boolean;
  /** When given, the index displaced by this build's schema is deleted along with it. */
  searchClient?: Meilisearch;
  onProgress?: (message: string) => void;
}

export interface BuildResult {
  schema: string;
  persons: number;
  cases: number;
  aggregates: number;
  droppedSchemas: string[];
}

export { readServingSlot } from "./slot";
export type { ServingSlot } from "./slot";

/**
 * Every aggregate key the site can facet on must have a label in this build. The
 * pre-flight check above only knows the codes the dictionaries and code rules can
 * produce; this one asks the built data itself, so a code that reaches the aggregates
 * by any other route still cannot ship unlabelled.
 */
async function assertAggregatesAreLabelled(client: pg.PoolClient, schema: string): Promise<void> {
  const dimensions = Object.keys(DIMENSION_LABEL_FIELD);
  const { rows } = await client.query<{ dimension: string; key: string }>(
    `SELECT d.dimension, d.key
       FROM ${schema}.agg_dimension d
       JOIN unnest($1::text[], $2::text[]) AS m(dimension, field) ON m.dimension = d.dimension
       LEFT JOIN ${schema}.code_label l ON l.field = m.field AND l.code = d.key
      WHERE l.field IS NULL
      ORDER BY d.dimension, d.key`,
    [dimensions, dimensions.map((d) => DIMENSION_LABEL_FIELD[d])],
  );
  if (rows.length === 0) return;
  const shown = rows.slice(0, 20).map((r) => `${r.dimension}/${r.key}`);
  const more = rows.length > shown.length ? `, and ${rows.length - shown.length} more` : "";
  throw new Error(`labels are incomplete: ${rows.length} aggregate keys have no label: ${shown.join(", ")}${more}`);
}

export async function buildServing(pool: pg.Pool, options: BuildOptions): Promise<BuildResult> {
  assertBuildId(options.buildId);
  const schema = servingSchemaName(options.buildId);

  // Read the slot before the build: the prune below compares this lineage with the one
  // the build leaves behind, and rebuilding the live schema needs the operator's consent.
  const before = await readServingSlot(pool);
  if (schema === before?.activeSchema && options.force !== true) {
    throw new Error(`build ${options.buildId} is the active build: pass --force to rebuild it in place (readers stall until COMMIT)`);
  }

  const missing = missingLabels(expectedCodes(loadAllDictionaries(options.dictsDir ?? "data/dicts")), options.labels);
  if (missing.length > 0) {
    const shown = missing.slice(0, 20).map((m) => `${m.field}/${m.code}`);
    const more = missing.length > shown.length ? `, and ${missing.length - shown.length} more` : "";
    throw new Error(`labels are incomplete: ${missing.length} codes lack a label (run "pnpm etl labels"): ${shown.join(", ")}${more}`);
  }
  const loaded = await pool.query(`SELECT count(*)::int AS n FROM staging.person`);
  if (loaded.rows[0].n === 0) throw new Error("staging.person is empty: run `pnpm etl normalize` first");

  const sql = readFileSync(resolve(process.cwd(), "scripts/etl/db/serving.sql"), "utf8").replaceAll("__SCHEMA__", schema);
  const labelRows: CopyValue[][] = options.labels.map((l) => [l.field, l.code, l.labelRu, l.sortOrder]);

  const client = await pool.connect();
  const droppedSchemas: string[] = [];
  let persons = 0;
  let cases = 0;
  let aggregates = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL work_mem = '256MB'");
    await client.query("SET LOCAL maintenance_work_mem = '512MB'");
    options.onProgress?.(`building ${schema}`);
    await client.query(sql);
    await copyRows(client, `COPY ${schema}.code_label (field, code, label_ru, sort_order) FROM STDIN`, labelRows);

    persons = (await client.query(`SELECT count(*)::int AS n FROM ${schema}.person`)).rows[0].n as number;
    cases = (await client.query(`SELECT count(*)::int AS n FROM ${schema}.person_case`)).rows[0].n as number;
    aggregates = (await client.query(`SELECT count(*)::int AS n FROM ${schema}.agg_dimension`)).rows[0].n as number;
    await assertAggregatesAreLabelled(client, schema);
    await client.query(`INSERT INTO ${schema}.build_info (key, value) VALUES ('build', $1)`, [
      JSON.stringify({ buildId: options.buildId, schema, builtAt: new Date().toISOString(), dataDate: options.dataDate, persons, cases }),
    ]);

    await ensureServingSlot(client);
    // Activate. Rebuilding the active build id must not turn previous_schema into itself,
    // and must leave the index columns alone: the index still matches the schema's build id.
    // When the active schema moves, its index moves with it into previous_index and the new
    // schema has no index until `etl index` runs -- an index always names the schema it
    // was built from, so it must never be paired with a different one.
    await activateBuild(client, { schema });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Prune outside the transaction: a failed DROP must not undo a successful build.
  // Prune by lineage, not by pattern: only the schemas (and, with a search client, the
  // index) this build displaced from the slot are dropped. A serving_% schema the slot
  // never named belongs to someone else -- another database's build restored here, a
  // hand-made copy -- and dropping it would destroy data this build knows nothing about.
  const pruned = await pruneBuilds(pool, options.searchClient ?? null, before, (await readServingSlot(pool))!);
  droppedSchemas.push(...pruned.schemas);

  return { schema, persons, cases, aggregates, droppedSchemas };
}
