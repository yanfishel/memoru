import { describe, expect, it } from "vitest";
import { listChangedPages, listLogChanges } from "../../../../scripts/etl/api/changes";
import { ApiHttpError, type ApiClient } from "../../../../scripts/etl/api/client";

/** A stand-in for ApiClient that replays canned bodies and records the params it was asked for. */
function fakeClient(bodies: unknown[]): { client: ApiClient; params: Record<string, string>[] } {
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

describe("listChangedPages", () => {
  it("paginates, de-duplicates page ids and tracks the newest timestamp", async () => {
    const { client, params } = fakeClient([
      {
        query: {
          allrevisions: [
            { pageid: 11, title: "A", revisions: [{ revid: 101, timestamp: "2023-03-01T00:10:00Z" }] },
            { pageid: 12, title: "B", revisions: [{ revid: 102, timestamp: "2023-03-01T00:20:00Z" }] },
          ],
        },
        continue: { arvcontinue: "20230301002000|102" },
      },
      {
        query: {
          allrevisions: [
            {
              pageid: 11,
              title: "A",
              revisions: [
                { revid: 103, timestamp: "2023-03-02T09:00:00Z" },
                { revid: 104, timestamp: "2023-03-02T09:05:00Z" },
              ],
            },
          ],
        },
      },
    ]);

    const result = await listChangedPages(client, "2023-03-01T00:00:00Z");
    expect(result.pageIds).toEqual([11, 12]);
    expect(result.revisions).toBe(4);
    expect(result.lastTimestamp).toBe("2023-03-02T09:05:00Z");
    expect(params[0]).toMatchObject({
      list: "allrevisions",
      arvdir: "newer",
      arvnamespace: "0",
      arvstart: "2023-03-01T00:00:00Z",
      arvlimit: "500",
    });
    expect(params[1].arvcontinue).toBe("20230301002000|102");
  });

  it("stops at the revision limit without asking for another page", async () => {
    const { client, params } = fakeClient([
      {
        query: {
          allrevisions: [
            { pageid: 11, title: "A", revisions: [{ revid: 101, timestamp: "2023-03-01T00:10:00Z" }] },
            { pageid: 12, title: "B", revisions: [{ revid: 102, timestamp: "2023-03-01T00:20:00Z" }] },
          ],
        },
        continue: { arvcontinue: "more" },
      },
    ]);
    const result = await listChangedPages(client, "2023-03-01T00:00:00Z", { limit: 2 });
    expect(result.pageIds).toEqual([11, 12]);
    expect(params).toHaveLength(1);
  });

  it("returns an empty result when nothing changed", async () => {
    const { client } = fakeClient([{ batchcomplete: "", query: { allrevisions: [] } }]);
    const result = await listChangedPages(client, "2026-09-01T00:00:00Z");
    expect(result).toEqual({ pageIds: [], lastTimestamp: null, revisions: 0 });
  });

  it("passes arvexcludeuser when excludeUser is given", async () => {
    const { client, params } = fakeClient([{ query: { allrevisions: [] } }]);
    await listChangedPages(client, "2023-03-01T00:00:00Z", { excludeUser: "OL Robot" });
    expect(params[0].arvexcludeuser).toBe("OL Robot");
  });

  it("omits arvexcludeuser when no excludeUser is given", async () => {
    const { client, params } = fakeClient([{ query: { allrevisions: [] } }]);
    await listChangedPages(client, "2023-03-01T00:00:00Z");
    expect(params[0].arvexcludeuser).toBeUndefined();
  });
});

describe("listLogChanges", () => {
  it("collects deletions", async () => {
    const { client, params } = fakeClient([
      {
        query: {
          logevents: [
            { logid: 1, type: "delete", action: "delete", title: "Удалённый Иван (1900)", pageid: 55, timestamp: "2024-01-05T10:00:00Z" },
          ],
        },
      },
    ]);

    const result = await listLogChanges(client, "2023-03-01T00:00:00Z");
    expect(result.deletedPageIds).toEqual([55]);
    expect(result.deletedEvents).toEqual([{ title: "Удалённый Иван (1900)", timestamp: "2024-01-05T10:00:00Z" }]);
    expect(result.lastTimestamp).toBe("2024-01-05T10:00:00Z");
    expect(params[0]).toMatchObject({
      list: "logevents",
      letype: "delete",
      ledir: "newer",
      lelimit: "500",
      lenamespace: "0",
    });
    expect(params).toHaveLength(1);
  });

  it("falls back to logpage when pageid is 0 and handles missing ids", async () => {
    const { client } = fakeClient([
      {
        query: {
          logevents: [
            { logid: 3, type: "delete", action: "delete", title: "Удалённая страница (1902)", pageid: 0, logpage: 77, timestamp: "2024-03-07T12:00:00Z" },
            { logid: 4, type: "delete", action: "delete", title: "Без идентификатора (1903)", timestamp: "2024-03-08T13:00:00Z" },
          ],
        },
      },
    ]);

    const result = await listLogChanges(client, "2023-03-01T00:00:00Z");
    expect(result.deletedPageIds).toEqual([77]);
    expect(result.deletedEvents).toEqual([
      { title: "Удалённая страница (1902)", timestamp: "2024-03-07T12:00:00Z" },
      { title: "Без идентификатора (1903)", timestamp: "2024-03-08T13:00:00Z" },
    ]);
    expect(result.lastTimestamp).toBe("2024-03-08T13:00:00Z");
  });

  it("prefers logpage over pageid when both are present", async () => {
    const { client } = fakeClient([
      {
        query: {
          logevents: [
            {
              logid: 6,
              type: "delete",
              action: "delete",
              title: "Восстановленная страница (1905)",
              pageid: 999,
              logpage: 77,
              timestamp: "2024-04-01T00:00:00Z",
            },
          ],
        },
      },
    ]);

    const result = await listLogChanges(client, "2023-03-01T00:00:00Z");
    expect(result.deletedPageIds).toEqual([77]);
  });

  it("falls back to a 50-item page on a 5xx error, then returns to 500 for the next request", async () => {
    const params: Record<string, string>[] = [];
    const client = {
      async query(p: Record<string, string>) {
        params.push(p);
        if (p.lelimit === "500" && !p.lecontinue) {
          throw new ApiHttpError(500, "boom");
        }
        if (p.lelimit === "50" && !p.lecontinue) {
          return {
            query: { logevents: [{ logid: 9, type: "delete", action: "delete", title: "T1", pageid: 1, timestamp: "2024-05-01T00:00:00Z" }] },
            continue: { lecontinue: "next" },
          };
        }
        return {
          query: { logevents: [{ logid: 10, type: "delete", action: "delete", title: "T2", pageid: 2, timestamp: "2024-05-02T00:00:00Z" }] },
        };
      },
      get requestCount() {
        return params.length;
      },
    } as unknown as ApiClient;

    const result = await listLogChanges(client, "2023-03-01T00:00:00Z");
    expect(result.deletedPageIds).toEqual([1, 2]);

    // first page: 500 at lelimit 500 (throws), falls back to lelimit 50 (succeeds)
    expect(params[0]).toMatchObject({ letype: "delete", lelimit: "500" });
    expect(params[0].lecontinue).toBeUndefined();
    expect(params[1]).toMatchObject({ letype: "delete", lelimit: "50" });
    expect(params[1].lecontinue).toBeUndefined();
    // next page: back to lelimit 500, with the continuation from the 50-item page
    expect(params[2]).toMatchObject({ letype: "delete", lelimit: "500", lecontinue: "next" });
  });
});
