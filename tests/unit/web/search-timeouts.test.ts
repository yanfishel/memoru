import { describe, expect, it, vi } from "vitest";
import type { Meilisearch } from "meilisearch";
import { findSimilar, SIMILAR_TIMEOUT_MS } from "../../../src/lib/search";

/**
 * The web client waits long enough for a cold index to answer a full search, but "Похожие записи" is an
 * optional block on the person page: it must give up on its own, shorter deadline and hide itself.
 */
describe("findSimilar", () => {
  it("caps its request with its own abort signal", async () => {
    const search = vi.fn().mockResolvedValue({ hits: [] });
    const client = { index: () => ({ search }) } as unknown as Meilisearch;
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await findSimilar({ id: 1, surname: "Сафронов", givenName: "Илья", birthYear: 1892 }, { client, indexName: "people_test" });

    expect(timeout).toHaveBeenCalledWith(SIMILAR_TIMEOUT_MS);
    expect(search.mock.calls[0][2]?.signal).toBe(timeout.mock.results[0].value);
    timeout.mockRestore();
  });

  it("returns no records when its request is aborted", async () => {
    const search = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const client = { index: () => ({ search }) } as unknown as Meilisearch;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const similar = await findSimilar({ id: 1, surname: "Сафронов", givenName: "Илья", birthYear: 1892 }, { client, indexName: "people_test" });

    expect(similar).toEqual([]);
    error.mockRestore();
  });
});
