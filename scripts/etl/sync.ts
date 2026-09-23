import type pg from "pg";
import type { ApiClient } from "./api/client";
import { listChangedPages, listLogChanges } from "./api/changes";
import { fetchPages } from "./api/pages";
import { copyRows, runSqlFile, type CopyValue } from "./db/copy";
import { MAX_RECORDED_ERRORS } from "./import";
import { parseFormular, type FormularPage } from "./parse/formular";

export interface SyncStats {
  changedPages: number;
  fetched: number;
  upserted: number;
  removed: number;
  skippedNoFormular: number;
  // Requested pages the API neither returned content for nor explicitly flagged
  // missing (e.g. a query-less body for a whole batch). Never deleted: see
  // FetchResult.unresolved in api/pages.ts.
  unresolved: number;
  errors: number;
  revisionsWalked: number;
  from: string;
  until: string | null;
  // Per-stream start/frontier: `*From` is this run's starting point for that
  // stream; `*Until` is where it ended up (its own `*From` again when the
  // stream saw nothing this run, never null — see the comment above `until`
  // in syncFromApi for why a quiet stream must not report null here).
  revisionsFrom: string;
  revisionsUntil: string;
  deletesFrom: string;
  deletesUntil: string;
  // Username actually asked to be excluded from the revision walk this run
  // (mirrors options.excludeUser; null when none was given).
  excludedUser: string | null;
}

export interface SyncOptions {
  since?: string;
  limitRevisions?: number;
  // Delete-log events walked per run. Defaults to limitRevisions * 5 (the
  // delete log is far denser than the revision stream on the live wiki), or
  // unbounded when limitRevisions itself is unset.
  limitLogEvents?: number;
  // A username (e.g. a known bot) whose edits the revision walk should skip
  // (MediaWiki arvexcludeuser, which takes exactly one user name).
  excludeUser?: string;
  dryRun?: boolean;
  parse?: (text: string) => FormularPage | null;
  onProgress?: (message: string) => void;
}

const MERGE_SQL = `
INSERT INTO staging.person_raw (page_id, title, rev_id, rev_ts, params, categories)
SELECT page_id, title, rev_id, rev_ts, params, categories FROM sync_batch
ON CONFLICT (page_id) DO UPDATE SET
  title = EXCLUDED.title,
  rev_id = EXCLUDED.rev_id,
  rev_ts = EXCLUDED.rev_ts,
  params = EXCLUDED.params,
  categories = EXCLUDED.categories
WHERE EXCLUDED.rev_id >= staging.person_raw.rev_id
`;

export async function readSyncFrontiers(
  pool: pg.Pool,
): Promise<{ revisionsUntil: string | null; deletesUntil: string | null; until: string | null } | null> {
  const { rows } = await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'sync'`);
  const value = rows[0]?.value as { revisionsUntil?: string | null; deletesUntil?: string | null; until?: string | null } | undefined;
  if (!value) return null;
  return {
    revisionsUntil: value.revisionsUntil ?? null,
    deletesUntil: value.deletesUntil ?? null,
    until: value.until ?? null,
  };
}

export async function readSyncCheckpoint(pool: pg.Pool): Promise<string | null> {
  const frontiers = await readSyncFrontiers(pool);
  return frontiers?.until ?? null;
}

export async function syncFromApi(
  pool: pg.Pool,
  client: ApiClient,
  options: SyncOptions = {},
): Promise<SyncStats> {
  const parse = options.parse ?? parseFormular;
  // On the first run --since seeds both streams alike. Otherwise each stream
  // resumes from its own stored frontier, falling back to the shared `until`
  // for a stream that has no frontier of its own yet (never ran, or was quiet
  // every run so far).
  const frontiers = options.since ? null : await readSyncFrontiers(pool);
  const revisionsFrom = options.since ?? frontiers?.revisionsUntil ?? frontiers?.until ?? null;
  const deletesFrom = options.since ?? frontiers?.deletesUntil ?? frontiers?.until ?? null;
  if (!revisionsFrom || !deletesFrom) {
    throw new Error("No sync checkpoint yet: pass --since <ISO timestamp> for the first run");
  }
  const from = minTimestamp(revisionsFrom, deletesFrom);

  const loaded = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
  if (loaded.rows[0].n === 0) {
    throw new Error("staging.person_raw is empty: run `pnpm etl import` before syncing");
  }

  const limitLogEvents = options.limitLogEvents ?? (options.limitRevisions !== undefined ? options.limitRevisions * 5 : undefined);

  options.onProgress?.(`discovering changes: revisions since ${revisionsFrom}, deletes since ${deletesFrom}`);
  const changed = await listChangedPages(client, revisionsFrom, {
    limit: options.limitRevisions,
    excludeUser: options.excludeUser,
    onProgress: (seen) => options.onProgress?.(`walked ${seen} revisions`),
  });
  const logs = await listLogChanges(client, deletesFrom, { limit: limitLogEvents });

  const deleted = new Set(logs.deletedPageIds);
  const toFetch = changed.pageIds.filter((id) => !deleted.has(id));

  options.onProgress?.(`fetching ${toFetch.length} pages`);
  const fetched = await fetchPages(client, toFetch, {
    onProgress: (done) => options.onProgress?.(`fetched ${done}/${toFetch.length}`),
  });

  const rows: CopyValue[][] = [];
  const errors: CopyValue[][] = [];
  let errorCount = 0;
  // Only ids the API explicitly confirmed deleted or missing are removed. Ids the
  // API failed to resolve (fetched.unresolved) are left alone: see Finding 1.
  const removeIds = new Set<number>([...deleted, ...fetched.missing]);
  let skippedNoFormular = 0;

  for (const page of fetched.pages) {
    try {
      const formular = parse(page.text);
      if (!formular) {
        skippedNoFormular++;
        removeIds.add(page.pageId);
        continue;
      }
      rows.push([page.pageId, page.title, page.revId, page.revTimestamp, formular.params, formular.categories]);
    } catch (err) {
      errorCount++;
      if (errors.length < MAX_RECORDED_ERRORS) errors.push([page.pageId, "sync", String(err)]);
    }
  }

  for (const id of fetched.unresolved) {
    errorCount++;
    if (errors.length < MAX_RECORDED_ERRORS) errors.push([id, "sync", "page not returned by the API"]);
  }

  // What gets STORED as each stream's own frontier must not be null on a
  // quiet stream: a null there falls back to `until` on the next run (see
  // revisionsFrom/deletesFrom above), which silently snaps a quiet stream
  // forward to wherever the OTHER stream ended up — skipping the gap it
  // never actually scanned. Storing the stream's own `from` instead means a
  // quiet stream simply holds its position until it next has real progress
  // to report.
  const revisionsUntilRaw = changed.lastTimestamp;
  const deletesUntilRaw = logs.lastTimestamp;
  const revisionsUntil = revisionsUntilRaw ?? revisionsFrom;
  const deletesUntil = deletesUntilRaw ?? deletesFrom;
  // The reported `until` (compat field feeding deriveBuildId/CLI display) is
  // still the min of the raw, possibly-null per-run results (resumeFrontier),
  // same as before — but a stream that has been quiet for a while now keeps
  // its own old `from` (see above), so that raw min can read EARLIER than
  // the checkpoint already on record (e.g. a quiet-both run after one stream
  // raced ahead and the other never moved). `until` must never move
  // backwards, so clamp it to the higher of that raw min and the previously
  // stored checkpoint.
  const until = maxTimestamp(resumeFrontier([revisionsUntilRaw, deletesUntilRaw], from), frontiers?.until ?? from);
  const upsertIds = rows.map((row) => row[0] as number);
  const stats: SyncStats = {
    changedPages: changed.pageIds.length,
    fetched: fetched.pages.length,
    upserted: 0,
    removed: 0,
    skippedNoFormular,
    unresolved: fetched.unresolved.length,
    errors: errorCount,
    revisionsWalked: changed.revisions,
    from,
    until,
    revisionsFrom,
    revisionsUntil,
    deletesFrom,
    deletesUntil,
    excludedUser: options.excludeUser ?? null,
  };

  if (options.dryRun) return stats;

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await runSqlFile(db, "scripts/etl/db/sync.sql");
    await copyRows(db, "COPY sync_batch (page_id, title, rev_id, rev_ts, params, categories) FROM STDIN", rows);
    const merged = await db.query(MERGE_SQL);
    stats.upserted = merged.rowCount ?? 0;

    if (removeIds.size > 0) {
      const removed = await db.query(`DELETE FROM staging.person_raw WHERE page_id = ANY($1::int[])`, [
        [...removeIds],
      ]);
      stats.removed = removed.rowCount ?? 0;
    }
    // Excluding this run's own upsertIds alone is not enough: with each stream
    // now resuming from its own frontier, the delete-log walk can reach an old
    // delete event many runs after the revision walk already upserted a
    // *different* page at that same title (a recreation it saw well before
    // the delete walk got this far). Only that row's own rev_ts can tell the
    // still-deleted occupant (older than the delete event) from a recreation
    // (written at or after it), regardless of which run wrote it.
    //
    // staging.person_raw has no index on title (3.9 GB), so this must be one
    // set-based statement rather than a DELETE per event: dedupe events by
    // title (keeping the latest timestamp) and pass parallel arrays through
    // unnest, so a single scan handles the whole batch.
    if (logs.deletedEvents.length > 0) {
      const latestByTitle = new Map<string, string>();
      for (const event of logs.deletedEvents) {
        const current = latestByTitle.get(event.title);
        if (!current || event.timestamp > current) latestByTitle.set(event.title, event.timestamp);
      }
      const titles = [...latestByTitle.keys()];
      const timestamps = [...latestByTitle.values()];
      const removedByTitle = await db.query(
        `DELETE FROM staging.person_raw p
         USING unnest($1::text[], $2::timestamptz[]) AS e(title, ts)
         WHERE p.title = e.title AND p.rev_ts < e.ts AND NOT (p.page_id = ANY($3::int[]))`,
        [titles, timestamps, upsertIds],
      );
      stats.removed += removedByTitle.rowCount ?? 0;
    }

    await db.query(`DELETE FROM staging.etl_errors WHERE stage = 'sync'`);
    await copyRows(db, "COPY staging.etl_errors (page_id, stage, reason) FROM STDIN", errors);

    if (until) {
      await db.query(
        `INSERT INTO staging.import_meta (key, value) VALUES ('sync', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ ...stats, errorsRecorded: errors.length, finishedAt: new Date().toISOString() })],
      );
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }

  return stats;
}

/**
 * Returns the MINIMUM of the non-null stream frontiers, not the maximum: the
 * revision walk and the delete-log walk are independent, paginated streams,
 * and each is now resumed from its own frontier (see revisionsFrom/deletesFrom
 * above). Reporting the later frontier would claim data as current past what
 * the slower stream actually reached. When every stream is quiet (nothing
 * changed), fall back to `from` so a checkpoint is still written and a
 * following run without `--since` has something to resume from.
 *
 * This raw min feeds the compatibility `until` field (deriveBuildId, CLI
 * display), but the caller clamps it against the previously stored checkpoint
 * (see the `until` assignment above) since this raw value alone can read
 * earlier than a checkpoint already on record.
 */
function resumeFrontier(candidates: Array<string | null>, from: string): string {
  const present = candidates.filter((value): value is string => value !== null);
  return present.length > 0 ? present.sort()[0]! : from;
}

function minTimestamp(a: string, b: string): string {
  return a < b ? a : b;
}

function maxTimestamp(a: string, b: string): string {
  return a > b ? a : b;
}
