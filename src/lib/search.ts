import "server-only";

import { Meilisearch } from "meilisearch";
import { getActiveServing } from "@/db/serving";
import { facetAttributes, SORT_ATTRIBUTES, SORT_KEYS, toMeiliFilter, toMeiliSort, type FilterState, type SortKey } from "./filters";
import { MAX_PAGES, PAGE_SIZE } from "./paging";
import { UI } from "./ui-text";

export interface SearchHit {
  id: number;
  name: string;
  birth_year: number | null;
  arrest_year: number | null;
  source_region_code: string;
  sentence_type: string;
  /** Drives the list's photo mark (ResultTable); missing on an index built before the field existed. */
  has_photo: boolean;
}

export interface SearchResult {
  unavailable?: false;
  hits: SearchHit[];
  total: number;
  page: number;
  pages: number;
  facets: Record<string, Record<string, number>>;
  /** Sort keys the active index supports; the table shows the others unsortable. */
  sortable: SortKey[];
}

export interface SearchUnavailable {
  unavailable: true;
  message: string;
}

const RETRIEVE = ["id", "name", "birth_year", "arrest_year", "source_region_code", "sentence_type", "has_photo"];

/** One settings read per index name for the process's lifetime: a build never changes its settings after publish. */
const sortableByIndex = new Map<string, Promise<SortKey[]>>();

function sortableKeys(index: { getSortableAttributes(): Promise<string[]> }, indexName: string): Promise<SortKey[]> {
  let pending = sortableByIndex.get(indexName);
  if (!pending) {
    pending = index
      .getSortableAttributes()
      .then((attributes) => SORT_KEYS.filter((key) => attributes.includes(SORT_ATTRIBUTES[key])))
      .catch((error: unknown) => {
        // A settings read that failed must not be cached, and must not take the whole search down with it:
        // this request simply sorts nothing and the table shows every column unsortable.
        console.error("sortable attributes unavailable:", error);
        sortableByIndex.delete(indexName);
        return [] as SortKey[];
      });
    sortableByIndex.set(indexName, pending);
  }
  return pending;
}

let client: Meilisearch | undefined;

/**
 * On the production box (1 vCPU, index far larger than RAM) the first search after a quiet spell reads
 * the index back from disk and took over 5 s, several times a day; at 5 s the visitor got "search
 * unavailable". A slow first answer beats an error, so the client waits this long.
 */
const SEARCH_TIMEOUT_MS = 20_000;
/** "Похожие записи" is optional: it gives up much sooner and the block hides itself. */
export const SIMILAR_TIMEOUT_MS = 5_000;

/** The only Meilisearch client in the web app. Server-side only: the key never reaches the browser. */
function defaultClient(): Meilisearch {
  if (!client) {
    const host = process.env.MEILI_URL;
    const apiKey = process.env.MEILI_MASTER_KEY;
    if (!host || !apiKey) throw new Error("MEILI_URL and MEILI_MASTER_KEY must be set");
    client = new Meilisearch({ host, apiKey, timeout: SEARCH_TIMEOUT_MS });
  }
  return client;
}

export async function searchPeople(
  state: FilterState,
  options: { indexName?: string; client?: Meilisearch; facetsOnly?: boolean } = {},
): Promise<SearchResult | SearchUnavailable> {
  try {
    const indexName = options.indexName ?? (await getActiveServing()).searchIndex;
    if (!indexName) return { unavailable: true, message: UI.searchUnavailable };
    const index = (options.client ?? defaultClient()).index<Record<string, unknown>>(indexName);
    const sortable = await sortableKeys(index, indexName);
    const response = await index.search(state.q || null, {
      filter: toMeiliFilter(state),
      facets: facetAttributes(),
      attributesToRetrieve: RETRIEVE,
      // A caller that only wants facetDistribution (loadExplore's baseline search) asks for zero hits:
      // Meilisearch still computes totalHits and facetDistribution over the full matched set, so this is
      // the cheapest possible request that still answers the question, not an approximation of it.
      hitsPerPage: options.facetsOnly ? 0 : PAGE_SIZE,
      page: state.page,
      // Global ordering with a name query depends on `INDEX_SETTINGS.rankingRules` putting `sort` first;
      // under Meilisearch's defaults a sort only orders within relevance buckets. An index built before
      // that setting (the dev one) needs `pnpm etl index` to pick it up.
      sort: toMeiliSort(state, sortable),
    });
    const total = response.totalHits ?? 0;
    return {
      hits: response.hits.map((h) => ({
        id: Number(h.id),
        name: String(h.name),
        birth_year: (h.birth_year as number | null) ?? null,
        arrest_year: (h.arrest_year as number | null) ?? null,
        source_region_code: String(h.source_region_code),
        sentence_type: String(h.sentence_type ?? "unknown"),
        // Absent on an index built before this field existed (attributesToRetrieve then just omits
        // it): read as "no photo" rather than as a crash, same spirit as sentence_type's fallback above.
        has_photo: h.has_photo === true,
      })),
      total,
      page: response.page ?? state.page,
      pages: Math.min(response.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE)), MAX_PAGES),
      facets: (response.facetDistribution ?? {}) as Record<string, Record<string, number>>,
      sortable,
    };
  } catch (err) {
    console.error("search unavailable:", err);
    return { unavailable: true, message: UI.searchUnavailable };
  }
}

export interface SimilarPerson {
  id: number;
  name: string;
  birth_year: number | null;
  source_region_code: string;
}

const SIMILAR_WINDOW = 3;
const SIMILAR_LIMIT = 5;

function fold(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

/**
 * Spec §5.3 "Похожие записи": namesakes born within three years, from one search — the name as the query,
 * the birth year as the filter, an exact surname + given name match in code. Empty on any failure.
 */
export async function findSimilar(
  person: { id: number; surname: string; givenName: string | null; birthYear: number | null },
  options: { indexName?: string; client?: Meilisearch } = {},
): Promise<SimilarPerson[]> {
  if (person.birthYear === null || !person.givenName) return [];
  try {
    const indexName = options.indexName ?? (await getActiveServing()).searchIndex;
    if (!indexName) return [];
    const index = (options.client ?? defaultClient()).index<Record<string, unknown>>(indexName);
    const response = await index.search(`${person.surname} ${person.givenName}`, {
      filter: [`birth_year >= ${person.birthYear - SIMILAR_WINDOW} AND birth_year <= ${person.birthYear + SIMILAR_WINDOW}`],
      attributesToRetrieve: ["id", "name", "surname", "given_name", "birth_year", "source_region_code"],
      limit: 20,
    }, { signal: AbortSignal.timeout(SIMILAR_TIMEOUT_MS) });
    return response.hits
      .filter((h) => Number(h.id) !== person.id && fold(String(h.surname)) === fold(person.surname) && fold(String(h.given_name ?? "")) === fold(person.givenName ?? ""))
      .slice(0, SIMILAR_LIMIT)
      .map((h) => ({ id: Number(h.id), name: String(h.name), birth_year: (h.birth_year as number | null) ?? null, source_region_code: String(h.source_region_code) }));
  } catch (err) {
    console.error("similar records unavailable:", err);
    return [];
  }
}
