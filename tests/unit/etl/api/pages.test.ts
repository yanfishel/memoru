import { describe, expect, it } from "vitest";
import { fetchPages } from "../../../../scripts/etl/api/pages";
import type { ApiClient } from "../../../../scripts/etl/api/client";

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

const FORMULAR = "{{Шаблон:Формуляр\n|пол=мужчина\n|дата рождения=1901\n}}\n[[Категория:Башкирия]]";

describe("fetchPages", () => {
  it("fetches in batches and maps to the dump page shape", async () => {
    const { client, params } = fakeClient([
      {
        query: {
          pages: {
            "11": {
              pageid: 11,
              title: "Иванов Иван Иванович (1901)",
              revisions: [{ revid: 501, timestamp: "2024-05-05T10:00:00Z", "*": FORMULAR }],
            },
          },
        },
      },
      {
        query: {
          pages: {
            "12": {
              pageid: 12,
              title: "Петров Пётр Петрович (1902)",
              revisions: [{ revid: 502, timestamp: "2024-05-06T10:00:00Z", "*": FORMULAR }],
            },
          },
        },
      },
    ]);

    const result = await fetchPages(client, [11, 12], { batchSize: 1 });
    expect(result.missing).toEqual([]);
    expect(result.pages).toEqual([
      { pageId: 11, title: "Иванов Иван Иванович (1901)", revId: 501, revTimestamp: "2024-05-05T10:00:00Z", text: FORMULAR },
      { pageId: 12, title: "Петров Пётр Петрович (1902)", revId: 502, revTimestamp: "2024-05-06T10:00:00Z", text: FORMULAR },
    ]);
    expect(params[0]).toMatchObject({ prop: "revisions", rvprop: "ids|timestamp|content", pageids: "11" });
    expect(params[1].pageids).toBe("12");
  });

  it("reports missing pages instead of throwing", async () => {
    const { client } = fakeClient([
      {
        query: {
          pages: {
            "99": { pageid: 99, ns: 0, title: "Удалённая страница", missing: "" },
            "13": {
              pageid: 13,
              title: "Сидоров Сидор Сидорович (1903)",
              revisions: [{ revid: 503, timestamp: "2024-05-07T10:00:00Z", "*": FORMULAR }],
            },
          },
        },
      },
    ]);
    const result = await fetchPages(client, [13, 99], { batchSize: 50 });
    expect(result.pages.map((p) => p.pageId)).toEqual([13]);
    expect(result.missing).toEqual([99]);
    expect(result.unresolved).toEqual([]);
  });

  it("treats a page with no revision content as unresolved", async () => {
    const { client } = fakeClient([
      { query: { pages: { "14": { pageid: 14, title: "Без текста", revisions: [] } } } },
    ]);
    const result = await fetchPages(client, [14]);
    expect(result.pages).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.unresolved).toEqual([14]);
  });

  it("does nothing when given no ids", async () => {
    const { client, params } = fakeClient([]);
    expect(await fetchPages(client, [])).toEqual({ pages: [], missing: [], unresolved: [] });
    expect(params).toHaveLength(0);
  });
});
