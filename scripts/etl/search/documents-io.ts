import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import type pg from "pg";
import { MeilisearchTaskTimeOutError, type Meilisearch, type Settings } from "meilisearch";
import { PERSON_COLUMNS, toDocument, type PersonDocument, type ServingPersonRow } from "./documents";

export async function* servingDocuments(pool: pg.Pool, schema: string, batchSize: number): AsyncGenerator<PersonDocument[]> {
  let lastId = -1;
  for (;;) {
    const { rows } = await pool.query<ServingPersonRow>(
      `SELECT ${PERSON_COLUMNS.join(", ")} FROM ${schema}.person WHERE id > $1 ORDER BY id LIMIT $2`,
      [lastId, batchSize],
    );
    if (rows.length === 0) return;
    lastId = rows[rows.length - 1].id;
    yield rows.map(toDocument);
  }
}

export async function writeDocumentsJsonl(batches: AsyncIterable<PersonDocument[]>, file: string): Promise<{ documents: number }> {
  let documents = 0;
  async function* lines(): AsyncGenerator<string> {
    for await (const batch of batches) {
      documents += batch.length;
      yield batch.map((d) => JSON.stringify(d)).join("\n") + (batch.length ? "\n" : "");
    }
  }
  await pipeline(Readable.from(lines()), createGzip({ level: 6 }), createWriteStream(file));
  return { documents };
}

export async function* readDocumentsJsonl(file: string, batchSize: number): AsyncGenerator<PersonDocument[]> {
  const input = createReadStream(file).pipe(createGunzip());
  const reader = createInterface({ input, crlfDelay: Infinity });
  let batch: PersonDocument[] = [];
  for await (const line of reader) {
    if (line.trim() === "") continue;
    batch.push(JSON.parse(line) as PersonDocument);
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

/** Poll `interval`, applied on top of the caller-provided `timeout` (see `meiliTaskTimeoutMs`
 * in config.ts — this module never reads `process.env` itself). */
const WAIT_INTERVAL_MS = 500;

/** Exported only so unit tests can drive the timeout-message path without faking a whole
 * Meilisearch client; `indexDocuments` is the real entry point. */
export async function waitOk(task: Promise<{ status: string; error?: unknown }>, what: string): Promise<void> {
  let done: { status: string; error?: unknown };
  try {
    done = await task;
  } catch (err) {
    if (err instanceof MeilisearchTaskTimeOutError) {
      const { taskUid, timeout } = err.cause;
      throw new Error(
        `Meilisearch ${what} did not finish within ${timeout}ms (task ${taskUid}). ` +
          `Meilisearch may still be working on it in the background: before re-running, check the task's real ` +
          `status with GET /tasks/${taskUid} on the Meilisearch instance. If it later shows "succeeded", this step's ` +
          `work is already done. Raise MEILI_TASK_TIMEOUT_MS if the hardware is just slow.`,
        { cause: err },
      );
    }
    throw err;
  }
  if (done.status !== "succeeded") throw new Error(`Meilisearch ${what} ${done.status}: ${JSON.stringify(done.error ?? {})}`);
}

/** Build a fresh index from document batches. Shared by `etl index` (reads Postgres) and
 * `etl publish` (reads the shipped JSONL). */
export async function indexDocuments(
  client: Meilisearch,
  indexName: string,
  batches: AsyncIterable<PersonDocument[]>,
  options: { settings: Settings; taskTimeoutMs: number; onProgress?: (done: number) => void },
): Promise<{ documents: number; tasks: number }> {
  const wait = { timeout: options.taskTimeoutMs, interval: WAIT_INTERVAL_MS };
  const existing = (await client.getIndexes({ limit: 1000 })).results.map((i) => i.uid);
  if (existing.includes(indexName)) await waitOk(client.deleteIndex(indexName).waitTask(wait), "delete stale index");
  await waitOk(client.createIndex(indexName, { primaryKey: "id" }).waitTask(wait), "create index");
  const index = client.index<PersonDocument>(indexName);

  let documents = 0;
  let tasks = 0;
  for await (const batch of batches) {
    await waitOk(index.addDocuments(batch).waitTask(wait), `add documents batch ${tasks + 1}`);
    documents += batch.length;
    tasks++;
    options.onProgress?.(documents);
  }
  await waitOk(index.updateSettings(options.settings).waitTask(wait), "update settings");
  const stats = await index.getStats();
  if (stats.numberOfDocuments !== documents) {
    throw new Error(`index ${indexName} holds ${stats.numberOfDocuments} documents, expected ${documents}`);
  }
  return { documents, tasks };
}
