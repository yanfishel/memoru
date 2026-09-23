import type pg from "pg";
import { copyRows, runSqlFile, type CopyValue } from "./db/copy";
import type { DumpPage } from "./dump/read-dump";
import { parseFormular, type FormularPage } from "./parse/formular";

export interface ImportStats {
  // Raw <page> blocks seen, not distinct pages: the dump repeats a page id across
  // scattered blocks, each holding a slice of that page's revision history.
  namespace0Pages: number;
  // Rows in staging.person_raw AFTER deduping by page_id (highest rev_id wins).
  // The pre-dedup block count is recorded separately as import_meta.import.rawBlocks.
  imported: number;
  skippedNoFormular: number;
  errors: number;
}

export interface ImportOptions {
  limit?: number;
  dumpPath?: string;
  parse?: (text: string) => FormularPage | null;
  onProgress?: (seen: number) => void;
}

// Bounds the in-memory error buffer: on the ~3M-page production load, a systemic
// parse bug could otherwise grow `errors` without limit and OOM the process
// before staging.etl_errors and staging.import_meta are ever written.
export const MAX_RECORDED_ERRORS = 10_000;

export async function importDump(
  pool: pg.Pool,
  pages: AsyncIterable<DumpPage>,
  options: ImportOptions = {},
): Promise<ImportStats> {
  const parse = options.parse ?? parseFormular;
  const stats: ImportStats = { namespace0Pages: 0, imported: 0, skippedNoFormular: 0, errors: 0 };
  const errors: CopyValue[][] = [];

  async function* rawRows(): AsyncGenerator<CopyValue[]> {
    for await (const page of pages) {
      stats.namespace0Pages++;
      if (stats.namespace0Pages % 100_000 === 0) options.onProgress?.(stats.namespace0Pages);
      try {
        const formular = parse(page.text);
        if (!formular) {
          stats.skippedNoFormular++;
        } else {
          stats.imported++;
          yield [page.pageId, page.title, page.revId, page.revTimestamp, formular.params, formular.categories];
        }
      } catch (err) {
        stats.errors++;
        if (errors.length < MAX_RECORDED_ERRORS) {
          errors.push([page.pageId, "import", String(err)]);
        }
      }
      if (options.limit !== undefined && stats.namespace0Pages >= options.limit) break;
    }
  }

  const client = await pool.connect();
  try {
    await runSqlFile(client, "scripts/etl/db/staging.sql");
    await copyRows(
      client,
      "COPY staging.person_raw (page_id, title, rev_id, rev_ts, params, categories) FROM STDIN",
      rawRows(),
    );
    await copyRows(client, "COPY staging.etl_errors (page_id, stage, reason) FROM STDIN", errors);

    // stats.imported so far counts raw blocks that parsed as a Формуляр (pre-dedup);
    // keep that as rawBlocks before replacing it with the post-dedup row count.
    const rawBlocks = stats.imported;

    // Collapse repeated page-id blocks to the one with the highest rev_id, in SQL:
    // 18.4M rows of jsonb must never be pulled into Node to do this. Raise the
    // session's work_mem first, or the DISTINCT ON sort spills to disk. The swap
    // (build the deduped table, drop the original, rename, add the PK) runs as one
    // transaction: Postgres DDL is transactional, so if any step fails, ROLLBACK
    // restores the intact pre-dedup person_raw and only this cheap step needs a
    // retry, instead of repeating the whole multi-hour COPY. work_mem is SET LOCAL
    // so it doesn't leak onto the pooled connection past this transaction/release.
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL work_mem = '256MB'");
      await client.query("SET LOCAL maintenance_work_mem = '512MB'");
      await client.query(
        "CREATE TABLE staging.person_raw_dedup AS " +
          "SELECT DISTINCT ON (page_id) * FROM staging.person_raw ORDER BY page_id, rev_id DESC",
      );
      await client.query("DROP TABLE staging.person_raw");
      await client.query("ALTER TABLE staging.person_raw_dedup RENAME TO person_raw");
      await client.query("ALTER TABLE staging.person_raw ADD PRIMARY KEY (page_id)");
      // `CREATE TABLE ... AS SELECT` above does not carry NOT NULL over from the
      // source table (only the PRIMARY KEY above re-establishes it, for page_id
      // alone). Restore the rest of staging.sql's declared NOT NULLs here, in the
      // same transaction, while the table has just been written (nearly free) --
      // normalize.ts calls parseTitle(row.title) etc. unguarded against NULL.
      await client.query(
        "ALTER TABLE staging.person_raw " +
          "ALTER COLUMN title SET NOT NULL, " +
          "ALTER COLUMN rev_id SET NOT NULL, " +
          "ALTER COLUMN rev_ts SET NOT NULL, " +
          "ALTER COLUMN params SET NOT NULL, " +
          "ALTER COLUMN categories SET NOT NULL",
      );

      const deduped = await client.query("SELECT count(*)::int AS n FROM staging.person_raw");
      stats.imported = deduped.rows[0].n as number;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    await client.query(
      "INSERT INTO staging.import_meta (key, value) VALUES ('import', $1)",
      [
        JSON.stringify({
          ...stats,
          rawBlocks,
          dumpPath: options.dumpPath ?? null,
          errorsRecorded: errors.length,
          finishedAt: new Date().toISOString(),
        }),
      ],
    );
  } finally {
    client.release();
  }
  return stats;
}
