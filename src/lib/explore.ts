import "server-only";

import { getLabels } from "@/db/queries";
import { getActiveServing } from "@/db/serving";
import { serializeLabels, type Facets, type SerializedLabels } from "./explore-state";
import { emptyFilters, parseFilters, type FilterState } from "./filters";
import { searchPeople, type SearchResult, type SearchUnavailable } from "./search";

/** Server-side half: everything else lives in `./explore-state`, which the browser can import. */
export * from "./explore-state";

export interface ExploreData {
  filters: FilterState;
  result: SearchResult | SearchUnavailable;
  labels: SerializedLabels;
  /**
   * An unfiltered facet distribution, for `withBaseline` to fall siblings back to — `undefined` only
   * when the primary search itself is unavailable, in which case the panel has nothing to show anyway.
   */
  baselineFacets: Facets | undefined;
}

/** True when the URL selects anything at all: a code, a year range, or a name query. */
function hasSelection(filters: FilterState): boolean {
  return Object.keys(filters.codes).length > 0 || Object.keys(filters.years).length > 0 || filters.q !== "";
}

/**
 * One request's worth of `/explore` (and `/search`, which shares this loader): the filters from the
 * URL, the search they select, the labels to read it with, and the baseline `withBaseline` needs.
 *
 * `result`'s own facets are a baseline only when `filters` selects nothing — Meilisearch computes
 * facetDistribution over the *filtered* result, so a dimension the reader has already narrowed reports
 * only the values they picked, with every sibling missing. When the URL arrives with a selection
 * already in it (a reload, a shared link, Back/Forward, a link from a person page), that first
 * server-rendered result is the only "baseline" the client has ever seen, and every filter's popover
 * would collapse to the current selection. A second, unfiltered, facets-only search fixes that: it is
 * the same shape of request `searchPeople` already serves, just without the `filter` clause and with
 * `facetsOnly` asking Meilisearch for zero hits (see `searchPeople`), so the extra request is cheap —
 * and it runs alongside the primary search and the labels read, not after them, so a filtered render
 * pays for the slower of the two searches, not their sum.
 */
export async function loadExplore(query: URLSearchParams): Promise<ExploreData> {
  const filters = parseFilters(query);
  const serving = await getActiveServing();
  const needsBaseline = hasSelection(filters);
  const [result, labels, baseline] = await Promise.all([
    searchPeople(filters),
    getLabels(serving),
    // searchPeople never throws (it turns a failure into SearchUnavailable), so a failed or unavailable
    // baseline search cannot break this page — `baselineFacets` below just falls back to today's
    // behaviour, the filtered result's own facets.
    needsBaseline ? searchPeople(emptyFilters(), { indexName: serving.searchIndex ?? undefined, facetsOnly: true }) : undefined,
  ]);

  let baselineFacets: Facets | undefined;
  if (!result.unavailable) {
    baselineFacets = result.facets as Facets;
    if (needsBaseline && baseline && !baseline.unavailable) baselineFacets = baseline.facets as Facets;
  }

  return { filters, result, labels: serializeLabels(labels), baselineFacets };
}
