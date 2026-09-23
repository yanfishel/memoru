import { DIMENSIONS, dimensionById, type Dimension, type DimensionId } from "./dimensions";
import { MAX_PAGES } from "./paging";

export interface YearFilter {
  from?: number;
  to?: number;
  unknown?: boolean;
}

export type ExploreViewId = "charts" | "map" | "list";
export type SortKey = "name" | "birth_year" | "arrest_year";
export type SortDir = "asc" | "desc";

export const VIEWS: readonly ExploreViewId[] = ["charts", "map", "list"];
export const DEFAULT_VIEW: ExploreViewId = "charts";
export const SORT_KEYS: readonly SortKey[] = ["name", "birth_year", "arrest_year"];
/** The Meilisearch attribute behind each sort key (`name` sorts by surname, the document's first name part). */
export const SORT_ATTRIBUTES: Record<SortKey, string> = { name: "surname", birth_year: "birth_year", arrest_year: "arrest_year" };
/** The list's order when the reader has chosen none: alphabetical by surname, ascending. */
export const DEFAULT_SORT_KEY: SortKey = "name";

export interface FilterState {
  codes: Partial<Record<DimensionId, string[]>>;
  years: Partial<Record<DimensionId, YearFilter>>;
  q: string;
  page: number;
  /** `/explore` tab; the API ignores it. */
  view: ExploreViewId;
  sort: SortKey | null;
  dir: SortDir;
}

const CODE = /^[a-z0-9_<>+\-]+$/i;
const YEAR_MIN = 1800;
const YEAR_MAX = 2030;
const UNKNOWN = "unknown";

export function emptyFilters(): FilterState {
  return { codes: {}, years: {}, q: "", page: 1, view: DEFAULT_VIEW, sort: null, dir: "asc" };
}

function parseYear(text: string): number | undefined {
  if (!/^\d{4}$/.test(text)) return undefined;
  const year = Number(text);
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : undefined;
}

function parseYearValue(value: string): YearFilter | undefined {
  const out: YearFilter = {};
  for (const part of value.split(",")) {
    if (part === UNKNOWN) {
      out.unknown = true;
      continue;
    }
    const range = /^(\d{4})?-(\d{4})?$/.exec(part);
    if (!range) {
      const single = parseYear(part);
      if (single !== undefined) {
        out.from = single;
        out.to = single;
      }
      continue;
    }
    const from = range[1] ? parseYear(range[1]) : undefined;
    const to = range[2] ? parseYear(range[2]) : undefined;
    if (from !== undefined) out.from = from;
    if (to !== undefined) out.to = to;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseFilters(params: URLSearchParams): FilterState {
  const state = emptyFilters();
  for (const dimension of DIMENSIONS) {
    const value = params.get(dimension.id);
    if (value === null || value === "") continue;
    if (dimension.kind === "year") {
      const year = parseYearValue(value);
      if (year) state.years[dimension.id] = year;
    } else {
      const codes = value.split(",").filter((c) => CODE.test(c));
      if (codes.length > 0) state.codes[dimension.id] = codes;
    }
  }
  state.q = (params.get("q") ?? "").trim().slice(0, 200);
  const page = Number(params.get("page") ?? "1");
  state.page = Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGES) : 1;
  const view = params.get("view");
  state.view = VIEWS.includes(view as ExploreViewId) ? (view as ExploreViewId) : DEFAULT_VIEW;
  const sort = params.get("sort");
  state.sort = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : null;
  // A direction without a sort key sorts nothing; normalising it here keeps `?dir=desc` alone out of the URL.
  state.dir = state.sort !== null && params.get("dir") === "desc" ? "desc" : "asc";
  return state;
}

export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  for (const [id, codes] of Object.entries(state.codes)) if (codes && codes.length) params.set(id, codes.join(","));
  for (const [id, year] of Object.entries(state.years)) {
    if (!year) continue;
    const parts: string[] = [];
    if (year.from !== undefined || year.to !== undefined) parts.push(`${year.from ?? ""}-${year.to ?? ""}`);
    if (year.unknown) parts.push(UNKNOWN);
    if (parts.length) params.set(id, parts.join(","));
  }
  if (state.q) params.set("q", state.q);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.view !== DEFAULT_VIEW) params.set("view", state.view);
  if (state.sort) params.set("sort", state.sort);
  if (state.dir !== "asc") params.set("dir", state.dir);
  params.sort();
  return params.toString();
}

function quote(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(",")}]`;
}

const BOOLEAN_VALUES = new Set(["true", "false"]);

function booleanClause(dimension: Dimension, codes: string[]): string | undefined {
  const values = codes.filter((c) => BOOLEAN_VALUES.has(c));
  const unique = Array.from(new Set(values));
  if (unique.length === 0) return undefined;
  const literals = unique.map((v) => `${dimension.attribute} = ${v}`);
  return literals.length > 1 ? `(${literals.join(" OR ")})` : literals[0];
}

function yearClause(dimension: Dimension, year: YearFilter): string | undefined {
  const parts: string[] = [];
  if (year.from !== undefined) parts.push(`${dimension.attribute} >= ${year.from}`);
  if (year.to !== undefined) parts.push(`${dimension.attribute} <= ${year.to}`);
  const range = parts.join(" AND ");
  const isNull = `${dimension.attribute} IS NULL`;
  if (range && year.unknown) return `(${range}) OR ${isNull}`;
  if (range) return range;
  if (year.unknown) return isNull;
  return undefined;
}

/** One Meilisearch filter clause per dimension, in registry order. Every value has been validated by parseFilters. */
export function toMeiliFilter(state: FilterState): string[] {
  const clauses: string[] = [];
  for (const dimension of DIMENSIONS) {
    if (dimension.kind === "year") {
      const year = state.years[dimension.id];
      const clause = year ? yearClause(dimension, year) : undefined;
      if (clause) clauses.push(clause);
    } else {
      const codes = state.codes[dimension.id]?.filter((c) => CODE.test(c));
      if (!codes || codes.length === 0) continue;
      if (dimension.valueType === "boolean") {
        const clause = booleanClause(dimension, codes);
        if (clause) clauses.push(clause);
      } else {
        clauses.push(`${dimension.attribute} IN ${quote(codes)}`);
      }
    }
  }
  return clauses;
}

/**
 * The sort key actually driving the list's order: the reader's explicit choice always wins. Absent
 * one, `DEFAULT_SORT_KEY` (alphabetical by surname) applies only when there is nothing better to rank
 * by — an empty query. A non-empty query with no explicit sort answers `null`: relevance decides the
 * order. This matters because `INDEX_SETTINGS.rankingRules` (documents.ts) puts `sort` ahead of
 * `words`/`typo`/etc., so *any* sort clause here — including the alphabetical default — overrides
 * relevance outright; sending one for a name search would return "Абаев…", "Абакумов…" instead of the
 * actual matches (see searchPeople's own comment on `sort`).
 *
 * Shared by `toMeiliSort`, the table's own sort indicator (ResultTable) and the header-click toggle
 * (explore-state's `setSort`), so all three agree on what "already sorted" means.
 */
export function effectiveSortKey(state: Pick<FilterState, "sort" | "q">): SortKey | null {
  if (state.sort) return state.sort;
  return state.q ? null : DEFAULT_SORT_KEY;
}

/** The Meilisearch `sort` clause, or none — either because the effective key is unsupported by the
 * active index (one built before that key became sortable), or because there is no effective key at
 * all (a query with no explicit sort: see `effectiveSortKey`). */
export function toMeiliSort(state: FilterState, sortable: readonly SortKey[]): string[] | undefined {
  const key = effectiveSortKey(state);
  if (!key || !sortable.includes(key)) return undefined;
  return [`${SORT_ATTRIBUTES[key]}:${state.dir}`];
}

export function facetAttributes(): string[] {
  return DIMENSIONS.map((d) => d.attribute);
}

/** Next.js hands a page its query as a plain object; the parser wants URLSearchParams. A repeated key keeps its first value. */
export function searchParamsToQuery(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out.set(key, value);
    else if (Array.isArray(value) && value.length) out.set(key, value[0]);
  }
  return out;
}

export { dimensionById };
