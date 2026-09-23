import { createReadStream } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ApiClient } from "../../scripts/etl/api/client";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { readSyncCheckpoint, readSyncFrontiers, syncFromApi } from "../../scripts/etl/sync";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
afterAll(() => pool.end());

const FORMULAR_NEW = "{{Шаблон:Формуляр\n|пол=женщина\n|дата рождения=1905\n}}\n[[Категория:Башкирия]]";

/** Replays canned API bodies in the order the sync asks for them. */
function fakeClient(bodies: unknown[]): ApiClient {
  return {
    async query() {
      const next = bodies.shift();
      if (next === undefined) throw new Error("no more canned bodies");
      return next;
    },
    get requestCount() {
      return 0;
    },
  } as unknown as ApiClient;
}

/** Like fakeClient, but also records the params each query call was asked with. */
function fakeClientWithParams(bodies: unknown[]): { client: ApiClient; params: Record<string, string>[] } {
  const params: Record<string, string>[] = [];
  const client = {
    async query(p: Record<string, string>) {
      params.push(p);
      const next = bodies.shift();
      if (next === undefined) throw new Error("no more canned bodies");
      return next;
    },
    get requestCount() {
      return params.length;
    },
  } as unknown as ApiClient;
  return { client, params };
}

function changedBody(pageIds: number[], timestamp: string) {
  return {
    query: {
      allrevisions: pageIds.map((id) => ({
        pageid: id,
        title: `page ${id}`,
        revisions: [{ revid: 9000 + id, timestamp }],
      })),
    },
  };
}

function contentBody(pages: Array<{ id: number; title: string; revId: number; ts: string; text: string }>) {
  return {
    query: {
      pages: Object.fromEntries(
        pages.map((p) => [
          String(p.id),
          { pageid: p.id, title: p.title, revisions: [{ revid: p.revId, timestamp: p.ts, "*": p.text }] },
        ]),
      ),
    },
  };
}

const emptyLogs = { query: { logevents: [] } };

beforeEach(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
});

describe("syncFromApi", () => {
  it("updates a changed page and keeps the rest", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-01T10:00:00Z"),
      emptyLogs,
      contentBody([
        { id: 101, title: "Сафронов Илья Федорович (1892)", revId: 5000, ts: "2024-06-01T10:00:00Z", text: FORMULAR_NEW },
      ]),
    ]);

    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats).toMatchObject({ changedPages: 1, fetched: 1, upserted: 1, removed: 0, errors: 0 });

    const { rows } = await pool.query(
      `SELECT rev_id, params->>'пол' AS sex, params->>'дата рождения' AS born FROM staging.person_raw WHERE page_id = 101`,
    );
    expect(rows[0]).toEqual({ rev_id: "5000", sex: "женщина", born: "1905" });

    const untouched = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
    expect(untouched.rows[0].n).toBe(2);
    expect(await readSyncCheckpoint(pool)).toBe("2024-06-01T10:00:00Z");
  });

  it("inserts a page that did not exist before", async () => {
    const client = fakeClient([
      changedBody([777], "2024-06-02T10:00:00Z"),
      emptyLogs,
      contentBody([{ id: 777, title: "Новикова Анна Ивановна (1905)", revId: 7770, ts: "2024-06-02T10:00:00Z", text: FORMULAR_NEW }]),
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats).toMatchObject({ upserted: 1 });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
    expect(rows[0].n).toBe(3);
  });

  it("ignores an older revision than the one already stored", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-03T10:00:00Z"),
      emptyLogs,
      contentBody([{ id: 101, title: "Сафронов Илья Федорович (1892)", revId: 1, ts: "2019-01-01T00:00:00Z", text: FORMULAR_NEW }]),
    ]);
    await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    const { rows } = await pool.query(`SELECT rev_id, params->>'пол' AS sex FROM staging.person_raw WHERE page_id = 101`);
    expect(rows[0]).toEqual({ rev_id: "1002", sex: "мужчина" });
  });

  it("removes a deleted page", async () => {
    const client = fakeClient([
      changedBody([], "2024-06-04T10:00:00Z"),
      { query: { logevents: [{ type: "delete", action: "delete", title: "Сверкот Павел Валентинович (1903)", pageid: 103, timestamp: "2024-06-04T10:00:00Z" }] } },
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats).toMatchObject({ removed: 1 });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw WHERE page_id = 103`);
    expect(rows[0].n).toBe(0);
  });

  it("removes a page that lost its Формуляр template", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-05T10:00:00Z"),
      emptyLogs,
      contentBody([{ id: 101, title: "Сафронов Илья Федорович (1892)", revId: 6000, ts: "2024-06-05T10:00:00Z", text: "Просто текст без формуляра" }]),
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats).toMatchObject({ skippedNoFormular: 1, removed: 1, upserted: 0 });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw WHERE page_id = 101`);
    expect(rows[0].n).toBe(0);
  });

  it("writes nothing on a dry run", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-06T10:00:00Z"),
      emptyLogs,
      contentBody([{ id: 101, title: "Сафронов Илья Федорович (1892)", revId: 6100, ts: "2024-06-06T10:00:00Z", text: FORMULAR_NEW }]),
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z", dryRun: true });
    expect(stats).toMatchObject({ fetched: 1, upserted: 0 });
    const { rows } = await pool.query(`SELECT rev_id FROM staging.person_raw WHERE page_id = 101`);
    expect(rows[0].rev_id).toBe("1002");
    expect(await readSyncCheckpoint(pool)).toBeNull();
  });

  it("resumes from the stored checkpoint", async () => {
    const first = fakeClient([
      changedBody([101], "2024-07-01T10:00:00Z"),
      emptyLogs,
      contentBody([{ id: 101, title: "Сафронов Илья Федорович (1892)", revId: 7000, ts: "2024-07-01T10:00:00Z", text: FORMULAR_NEW }]),
    ]);
    await syncFromApi(pool, first, { since: "2023-03-01T00:00:00Z" });
    expect(await readSyncCheckpoint(pool)).toBe("2024-07-01T10:00:00Z");
    // The revision stream moved; the delete stream (emptyLogs) saw nothing, so
    // it keeps its own frontier at where it started this run (`since`) rather
    // than reporting null (which would let a later run silently snap it
    // forward to the revision stream's frontier without ever having scanned
    // that gap — see the comment on `until` in sync.ts). The compatibility
    // `until` still tracks the one stream that did move.
    expect(await readSyncFrontiers(pool)).toEqual({
      revisionsUntil: "2024-07-01T10:00:00Z",
      deletesUntil: "2023-03-01T00:00:00Z",
      until: "2024-07-01T10:00:00Z",
    });

    const checkpointBeforeSecondRun = await readSyncCheckpoint(pool);
    const second = fakeClient([changedBody([], "2024-07-01T10:00:00Z"), emptyLogs]);
    const stats = await syncFromApi(pool, second);
    // The revision stream resumes from its own frontier; the (still quiet)
    // delete stream resumes from its own unmoved frontier, which is earlier.
    expect(stats.from).toBe("2023-03-01T00:00:00Z");
    // Both streams are quiet again this run, so the RAW min (resumeFrontier)
    // alone would regress to `from` = the delete stream's frozen, much
    // earlier starting point. `until` must never move backwards, so it stays
    // clamped at the checkpoint already on record instead.
    expect(stats.until).toBe("2024-07-01T10:00:00Z");
    expect(stats.until! >= checkpointBeforeSecondRun!).toBe(true);
    expect(await readSyncCheckpoint(pool)).toBe("2024-07-01T10:00:00Z");
  });

  it("resumes each stream from its own frontier when one hits its limit before the other", async () => {
    const revisionsLimitedBody = {
      query: {
        allrevisions: [
          { pageid: 401, title: "page 401", revisions: [{ revid: 9401, timestamp: "2024-08-01T05:00:00Z" }] },
          { pageid: 402, title: "page 402", revisions: [{ revid: 9402, timestamp: "2024-08-01T06:00:00Z" }] },
        ],
      },
      // More revisions are available (arvcontinue is set), but --limit-revisions
      // stops the walk after this page, well before the delete log below.
      continue: { arvcontinue: "more-revisions" },
    };
    const deletesCompleteBody = {
      query: {
        logevents: [
          {
            type: "delete",
            action: "delete",
            title: "Удалённая на дальнем рубеже (1899)",
            pageid: 555,
            timestamp: "2024-08-10T00:00:00Z",
          },
        ],
      },
    };

    const first = fakeClient([
      revisionsLimitedBody,
      deletesCompleteBody,
      contentBody([
        { id: 401, title: "Новая персона 401", revId: 9401, ts: "2024-08-01T05:00:00Z", text: FORMULAR_NEW },
        { id: 402, title: "Новая персона 402", revId: 9402, ts: "2024-08-01T06:00:00Z", text: FORMULAR_NEW },
      ]),
    ]);
    const stats = await syncFromApi(pool, first, { since: "2024-08-01T00:00:00Z", limitRevisions: 2 });

    expect(stats.revisionsUntil).toBe("2024-08-01T06:00:00Z");
    expect(stats.deletesUntil).toBe("2024-08-10T00:00:00Z");
    expect(stats.revisionsUntil < stats.deletesUntil).toBe(true);
    expect(stats.until).toBe(stats.revisionsUntil);
    expect(await readSyncCheckpoint(pool)).toBe("2024-08-01T06:00:00Z");

    // The second run has no --since: each stream must resume from its own
    // stored frontier, not from the combined (earlier) `until`.
    const { client: second, params } = fakeClientWithParams([
      { query: { allrevisions: [] } },
      { query: { logevents: [] } },
    ]);
    await syncFromApi(pool, second);
    expect(params[0]).toMatchObject({ arvstart: "2024-08-01T06:00:00Z" });
    expect(params[1]).toMatchObject({ lestart: "2024-08-10T00:00:00Z" });

    // A third, fully quiet run: both streams already have real (non-derived)
    // frontiers from earlier runs, so going quiet must hold each one exactly
    // where it was — not regress it toward the other stream's `from`.
    const { client: third, params: thirdParams } = fakeClientWithParams([
      { query: { allrevisions: [] } },
      { query: { logevents: [] } },
    ]);
    await syncFromApi(pool, third);
    expect(thirdParams[0]).toMatchObject({ arvstart: "2024-08-01T06:00:00Z" });
    expect(thirdParams[1]).toMatchObject({ lestart: "2024-08-10T00:00:00Z" });
  });

  it("passes excludeUser through to the revision walk as arvexcludeuser", async () => {
    const { client, params } = fakeClientWithParams([{ query: { allrevisions: [] } }, emptyLogs]);
    const stats = await syncFromApi(pool, client, {
      since: "2023-03-01T00:00:00Z",
      excludeUser: "OL Robot",
    });
    expect(params[0]).toMatchObject({ arvexcludeuser: "OL Robot" });
    expect(stats.excludedUser).toBe("OL Robot");
  });

  it("refuses to run against an empty person_raw", async () => {
    await pool.query("TRUNCATE staging.person_raw");
    await expect(syncFromApi(pool, fakeClient([]), { since: "2023-03-01T00:00:00Z" })).rejects.toThrow(
      /person_raw is empty/,
    );
  });

  it("keeps a page the API failed to resolve instead of deleting it", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-07T10:00:00Z"),
      emptyLogs,
      { query: { pages: {} } },
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats).toMatchObject({ unresolved: 1, removed: 0 });

    const { rows } = await pool.query(`SELECT rev_id FROM staging.person_raw WHERE page_id = 101`);
    expect(rows[0].rev_id).toBe("1002");

    const errRows = await pool.query(
      `SELECT page_id, stage FROM staging.etl_errors WHERE stage = 'sync'`,
    );
    expect(errRows.rows).toEqual([{ page_id: 101, stage: "sync" }]);
  });

  it("does not delete a page just upserted at a deleted title", async () => {
    const client = fakeClient([
      changedBody([888], "2024-06-08T10:00:00Z"),
      {
        query: {
          logevents: [
            {
              type: "delete",
              action: "delete",
              title: "Сверкот Павел Валентинович (1903)",
              pageid: 103,
              timestamp: "2024-06-08T10:00:00Z",
            },
          ],
        },
      },
      contentBody([
        {
          id: 888,
          title: "Сверкот Павел Валентинович (1903)",
          revId: 8880,
          ts: "2024-06-08T10:00:00Z",
          text: FORMULAR_NEW,
        },
      ]),
    ]);
    const stats = await syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" });
    expect(stats.removed).toBe(1);

    const gone = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw WHERE page_id = 103`);
    expect(gone.rows[0].n).toBe(0);
    const kept = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw WHERE page_id = 888`);
    expect(kept.rows[0].n).toBe(1);
  });

  it("does not delete a page recreated at a deleted title in an earlier run", async () => {
    // Run 1: the revision walk (ahead) upserts a new page 888 at the same
    // title the old dump page 103 already occupies; the delete walk is quiet.
    const first = fakeClient([
      changedBody([888], "2024-06-05T10:00:00Z"),
      emptyLogs,
      contentBody([
        {
          id: 888,
          title: "Сверкот Павел Валентинович (1903)",
          revId: 8881,
          ts: "2024-06-05T10:00:00Z",
          text: FORMULAR_NEW,
        },
      ]),
    ]);
    await syncFromApi(pool, first, { since: "2023-03-01T00:00:00Z" });

    const beforeRows = await pool.query(
      `SELECT page_id FROM staging.person_raw WHERE title = 'Сверкот Павел Валентинович (1903)' ORDER BY page_id`,
    );
    expect(beforeRows.rows.map((r) => r.page_id)).toEqual([103, 888]);

    // Run 2 (no --since): the delete walk, resuming from its own unmoved
    // frontier, only now reaches a delete event for the OLD page 103 — dated
    // before page 888's rev_ts, i.e. from before the recreation. Page 888 was
    // not upserted in this run, so only rev_ts protects it from the title
    // sweep.
    const second = fakeClient([
      changedBody([], "2024-06-04T10:00:00Z"),
      {
        query: {
          logevents: [
            {
              type: "delete",
              action: "delete",
              title: "Сверкот Павел Валентинович (1903)",
              pageid: 103,
              timestamp: "2024-06-04T10:00:00Z",
            },
          ],
        },
      },
    ]);
    const stats = await syncFromApi(pool, second);
    expect(stats.removed).toBe(1);

    const afterRows = await pool.query(
      `SELECT page_id FROM staging.person_raw WHERE title = 'Сверкот Павел Валентинович (1903)'`,
    );
    expect(afterRows.rows.map((r) => r.page_id)).toEqual([888]);
  });

  it("is idempotent when replayed with identical canned bodies", async () => {
    function buildClient() {
      return fakeClient([
        changedBody([101], "2024-06-09T10:00:00Z"),
        emptyLogs,
        contentBody([
          { id: 101, title: "Сафронов Илья Федорович (1892)", revId: 9100, ts: "2024-06-09T10:00:00Z", text: FORMULAR_NEW },
        ]),
      ]);
    }

    await syncFromApi(pool, buildClient(), { since: "2023-03-01T00:00:00Z" });
    const firstRows = await pool.query(
      `SELECT page_id, rev_id, params FROM staging.person_raw ORDER BY page_id`,
    );
    const firstCheckpoint = await readSyncCheckpoint(pool);

    await syncFromApi(pool, buildClient(), { since: "2023-03-01T00:00:00Z" });
    const secondRows = await pool.query(
      `SELECT page_id, rev_id, params FROM staging.person_raw ORDER BY page_id`,
    );
    const secondCheckpoint = await readSyncCheckpoint(pool);

    expect(secondRows.rows).toEqual(firstRows.rows);
    expect(secondCheckpoint).toBe(firstCheckpoint);
  });

  it("records a parse failure without touching the existing row", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-10T10:00:00Z"),
      emptyLogs,
      contentBody([
        { id: 101, title: "Сафронов Илья Федорович (1892)", revId: 9200, ts: "2024-06-10T10:00:00Z", text: FORMULAR_NEW },
      ]),
    ]);
    const stats = await syncFromApi(pool, client, {
      since: "2023-03-01T00:00:00Z",
      parse: () => {
        throw new Error("boom");
      },
    });
    expect(stats.errors).toBe(1);

    const { rows } = await pool.query(`SELECT rev_id FROM staging.person_raw WHERE page_id = 101`);
    expect(rows[0].rev_id).toBe("1002");

    const errRows = await pool.query(`SELECT stage, reason FROM staging.etl_errors WHERE stage = 'sync'`);
    expect(errRows.rows).toHaveLength(1);
    expect(errRows.rows[0].reason).toContain("boom");
  });

  it("rolls back the whole transaction when the COPY fails", async () => {
    const client = fakeClient([
      changedBody([101], "2024-06-11T10:00:00Z"),
      emptyLogs,
      contentBody([
        { id: 101, title: "Сафронов Илья Федорович (1892)", revId: 9300, ts: "not-a-timestamp", text: FORMULAR_NEW },
      ]),
    ]);
    await expect(syncFromApi(pool, client, { since: "2023-03-01T00:00:00Z" })).rejects.toThrow();

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staging.person_raw`);
    expect(rows[0].n).toBe(2);
    const page101 = await pool.query(`SELECT rev_id FROM staging.person_raw WHERE page_id = 101`);
    expect(page101.rows[0].rev_id).toBe("1002");
    expect(await readSyncCheckpoint(pool)).toBeNull();
  });
});
