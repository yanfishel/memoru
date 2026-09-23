import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterState } from "../../../src/lib/filters";
import type { SearchResult } from "../../../src/lib/search";

/**
 * `loadExplore` reaches the database and Meilisearch through `@/db/serving`, `@/db/queries` and
 * `@/lib/search` respectively; mocking those three boundaries keeps this a fast unit test while still
 * exercising `loadExplore`'s own logic for real. `vi.hoisted` is needed because `vi.mock` factories run
 * before the top-level `const`s below them.
 */
const { searchPeopleMock, getActiveServingMock, getLabelsMock } = vi.hoisted(() => ({
  searchPeopleMock: vi.fn(),
  getActiveServingMock: vi.fn(),
  getLabelsMock: vi.fn(),
}));

vi.mock("../../../src/lib/search", () => ({ searchPeople: searchPeopleMock }));
vi.mock("../../../src/db/serving", () => ({ getActiveServing: getActiveServingMock }));
vi.mock("../../../src/db/queries", () => ({ getLabels: getLabelsMock }));

const { loadExplore } = await import("../../../src/lib/explore");

function facetResult(facets: SearchResult["facets"]): SearchResult {
  return { hits: [], total: 0, page: 1, pages: 1, facets, sortable: [] };
}

beforeEach(() => {
  searchPeopleMock.mockReset();
  getActiveServingMock.mockReset().mockResolvedValue({ schema: "s", searchIndex: "people_test" });
  getLabelsMock.mockReset().mockResolvedValue(new Map());
});

describe("loadExplore", () => {
  it("carries an unfiltered baseline whose distribution includes values the filtered result does not", async () => {
    searchPeopleMock.mockImplementation(async (state: FilterState) => {
      if (state.codes.nationality?.length) return facetResult({ nationality_code: { russian: 5 } });
      return facetResult({ nationality_code: { russian: 5, german: 3 } });
    });

    const data = await loadExplore(new URLSearchParams("nationality=russian"));

    if (data.result.unavailable) throw new Error("unexpected: search unavailable");
    // The live result, filtered on nationality, only ever reports the selected value.
    expect(data.result.facets.nationality_code).toEqual({ russian: 5 });
    // The baseline must still carry the sibling the filtered search cannot report.
    expect(data.baselineFacets?.nationality_code).toEqual({ russian: 5, german: 3 });
    expect(searchPeopleMock).toHaveBeenCalledTimes(2);
    // The second call asks for an unfiltered, facets-only search.
    const [, secondOptions] = searchPeopleMock.mock.calls[1] as [FilterState, { facetsOnly?: boolean }];
    const secondState = searchPeopleMock.mock.calls[1][0] as FilterState;
    expect(secondState.codes).toEqual({});
    expect(secondOptions?.facetsOnly).toBe(true);
  });

  it("skips the second search entirely when the URL carries no filter", async () => {
    searchPeopleMock.mockResolvedValue(facetResult({ nationality_code: { russian: 5, german: 3 } }));

    const data = await loadExplore(new URLSearchParams());

    expect(searchPeopleMock).toHaveBeenCalledTimes(1);
    if (data.result.unavailable) throw new Error("unexpected: search unavailable");
    expect(data.baselineFacets).toEqual(data.result.facets);
  });

  it("falls back to the filtered result's own facets when the baseline search is unavailable", async () => {
    searchPeopleMock.mockImplementation(async (state: FilterState) => {
      if (state.codes.nationality?.length) return facetResult({ nationality_code: { russian: 5 } });
      return { unavailable: true, message: "boom" };
    });

    const data = await loadExplore(new URLSearchParams("nationality=russian"));

    if (data.result.unavailable) throw new Error("unexpected: search unavailable");
    expect(data.baselineFacets).toEqual({ nationality_code: { russian: 5 } });
  });

  it("treats a name query alone as a selection that needs a baseline search", async () => {
    searchPeopleMock.mockImplementation(async (state: FilterState) => {
      if (state.q) return facetResult({ nationality_code: { russian: 1 } });
      return facetResult({ nationality_code: { russian: 5, german: 3 } });
    });

    const data = await loadExplore(new URLSearchParams("q=Иванов"));

    expect(searchPeopleMock).toHaveBeenCalledTimes(2);
    expect(data.baselineFacets?.nationality_code).toEqual({ russian: 5, german: 3 });
  });
});
