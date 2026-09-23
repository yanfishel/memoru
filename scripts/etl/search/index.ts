import type pg from "pg";
import type { Meilisearch } from "meilisearch";
import { assertBuildId, searchIndexName, servingSchemaName } from "../serving/build-id";
import { activateBuild, pruneBuilds, readServingSlot } from "../serving/slot";
import { indexDocuments, servingDocuments } from "./documents-io";
import { INDEX_SETTINGS } from "./documents";

export interface IndexOptions {
  buildId: string;
  /** Serving schema to read; defaults to the active one in serving_slot. */
  schema?: string;
  batchSize?: number;
  /** Rebuild the index that is currently registered; searches fail until it is refilled. */
  force?: boolean;
  /** How long to wait for each Meilisearch task; defaults to config.ts's MEILI_TASK_TIMEOUT_MS
   * default for callers (mainly tests) that build options by hand instead of loading config. */
  taskTimeoutMs?: number;
  onProgress?: (done: number) => void;
}

export interface IndexResult {
  index: string;
  documents: number;
  tasks: number;
}

const DEFAULT_BATCH = 20_000;
const DEFAULT_TASK_TIMEOUT_MS = 2 * 60 * 60_000;

export async function buildSearchIndex(pool: pg.Pool, client: Meilisearch, options: IndexOptions): Promise<IndexResult> {
  assertBuildId(options.buildId);
  const slot = await readServingSlot(pool);
  const schema = options.schema ?? slot?.activeSchema;
  if (!schema) throw new Error("no serving schema: run `pnpm etl aggregate` first");
  if (schema !== servingSchemaName(options.buildId)) {
    throw new Error(`build id ${options.buildId} does not match the serving schema ${schema}`);
  }
  const indexName = searchIndexName(options.buildId);
  if (indexName === slot?.searchIndex && options.force !== true) {
    throw new Error(`index ${indexName} is the registered search index: pass --force to rebuild it in place (searches find nothing until it is refilled)`);
  }
  const batchSize = options.batchSize ?? DEFAULT_BATCH;

  const { documents, tasks } = await indexDocuments(client, indexName, servingDocuments(pool, schema, batchSize), {
    settings: INDEX_SETTINGS,
    taskTimeoutMs: options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
    onProgress: options.onProgress,
  });

  // Prune only the index this build displaces from the slot, never the whole instance:
  // dev and tests can share a Meilisearch server, so enumerating and deleting every
  // unrecognized `people_*` index would destroy indexes this build knows nothing about.
  const before = await readServingSlot(pool);
  await activateBuild(pool, { index: indexName });
  await pruneBuilds(pool, client, before, (await readServingSlot(pool))!);

  return { index: indexName, documents, tasks };
}
