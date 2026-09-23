/**
 * The half of `./explore` the browser needs: pure filter and slice helpers with no database or search
 * client behind them, so a client component can import them without dragging `pg` into the bundle
 * (the same split as `./map` and `./map-server`). `./explore` re-exports all of it.
 */
import type { LabelMap } from "@/db/queries";
import { slicesFor, type Slice } from "./charts";
import { dimensionById, type Dimension, type DimensionId } from "./dimensions";
import { effectiveSortKey, emptyFilters, type ExploreViewId, type FilterState, type SortDir, type SortKey, type YearFilter } from "./filters";

/** One facet attribute's distribution, keyed the way Meilisearch returns it. */
export type Facets = Record<string, Record<string, number>>;

/**
 * One edit to the filter state: a code toggle, a whole-dimension replacement (`codes`, for a grouped
 * chip's remove button — an empty array clears the dimension), a year range, or the name query.
 *
 * A discriminated union tagged by `kind`, one member per shape of edit — not a bag of optional fields.
 * A plain optional-fields shape (`{ dimension?; code?; codes?; on?; year?; q? }`) cannot stop a change
 * literal from carrying both `code` and `codes` at once: TypeScript's excess-property check only flags
 * a property unknown to *every* member of a union, and `codes` would be known to the "codes" member, so
 * `{ dimension, code, on, codes }` would slip through undetected. The `kind` tag makes each member
 * structurally exclusive — `change.kind === "code"` narrows `change` to a type that does not have a
 * `codes` property at all, so `applyChange` below cannot read the wrong field, and a caller cannot
 * construct a literal with both without TypeScript rejecting the excess `codes` key for that `kind`.
 */
export type FilterChange =
  | { kind: "code"; dimension: DimensionId; code: string; on: boolean }
  | { kind: "codes"; dimension: DimensionId; codes: string[] }
  | { kind: "year"; dimension: DimensionId; year: YearFilter }
  | { kind: "q"; q: string };

const MAX_QUERY_LENGTH = 200;

/** `LabelMap` is nested `Map`s, which a server component cannot hand to a client one; arrays survive the boundary. */
export type SerializedLabels = Array<[string, Array<[string, { labelRu: string; sortOrder: number }]>]>;

export function serializeLabels(labels: LabelMap): SerializedLabels {
  return [...labels].map(([field, byCode]) => [field, [...byCode]]);
}

export function deserializeLabels(labels: SerializedLabels): LabelMap {
  return new Map(labels.map(([field, byCode]) => [field, new Map(byCode)]));
}

/**
 * One dimension's facet distribution as labelled slices, ordered and with the unknown share kept visible,
 * plus the coverage caveat the home page shows under the same charts. `top` keeps the largest values and
 * folds the rest into one slice instead of dropping them.
 */
export function facetSlices(
  dimension: Dimension,
  facets: Record<string, Record<string, number>>,
  labels: LabelMap,
  options: { top?: number; dropUnknown?: boolean; mergeUnknown?: boolean } = {},
): { slices: Slice[]; caveat: string | null } {
  const rows = Object.entries(facets[dimension.attribute] ?? {}).map(([key, count]) => ({ key, count }));
  const { slices, caveat } = slicesFor(dimension, rows, labels, options);
  return { slices, caveat };
}

/** Toggles one code, replaces or clears a whole dimension, sets or clears one year filter, or the name query — always returns to the first page. */
export function applyChange(state: FilterState, change: FilterChange): FilterState {
  const next: FilterState = { codes: { ...state.codes }, years: { ...state.years }, q: state.q, page: 1, view: state.view, sort: state.sort, dir: state.dir };
  switch (change.kind) {
    case "code": {
      const current = new Set(next.codes[change.dimension] ?? []);
      if (change.on) current.add(change.code);
      else current.delete(change.code);
      if (current.size) next.codes[change.dimension] = [...current];
      else delete next.codes[change.dimension];
      break;
    }
    case "codes":
      if (change.codes.length) next.codes[change.dimension] = [...change.codes];
      else delete next.codes[change.dimension];
      break;
    case "year": {
      const year = change.year;
      if (year.from === undefined && year.to === undefined && !year.unknown) delete next.years[change.dimension];
      else next.years[change.dimension] = year;
      break;
    }
    case "q":
      // Clamped the same way parseFilters clamps the URL, so a typed query and a pasted link agree.
      next.q = change.q.trim().slice(0, MAX_QUERY_LENGTH);
      break;
  }
  return next;
}

/**
 * Merges the live facet counts onto the first render's distribution so the panel keeps every value
 * reachable instead of collapsing to the current selection.
 *
 * One search returns one facet distribution, and Meilisearch computes it over the filtered result: a
 * dimension the reader has filtered on therefore reports only the values they picked, with every
 * sibling at zero. Honest sibling counts would need a second query per filtered dimension (each one
 * run without its own clause), which this view does not make; until then a filtered dimension shows
 * its siblings at the baseline count — the last number measured before that filter narrowed them —
 * rather than a zero that would read as "no such records".
 */
/**
 * The charts' view of the facets: every value the unfiltered baseline knows, carrying its live count or
 * zero. Meilisearch omits a value with no matches, so without this a filter elsewhere makes whole rows
 * disappear and the chart changes height; a zero row is kept and drawn dimmed instead. Unlike
 * `withBaseline` this never substitutes a baseline count — a chart must show what the filter selects.
 */
export function zeroFilled(baseline: Facets | undefined, live: Facets | undefined): Facets {
  const out: Facets = {};
  for (const [attribute, distribution] of Object.entries(baseline ?? {})) {
    out[attribute] = Object.fromEntries(Object.keys(distribution ?? {}).map((key) => [key, live?.[attribute]?.[key] ?? 0]));
  }
  for (const [attribute, distribution] of Object.entries(live ?? {})) out[attribute] = { ...out[attribute], ...distribution };
  return out;
}

export function withBaseline(baseline: Facets | undefined, live: Facets | undefined, filters: FilterState): Facets {
  const selfFiltered = new Set(
    Object.entries(filters.codes)
      .filter(([, codes]) => codes !== undefined && codes.length > 0)
      .map(([id]) => dimensionById(id as DimensionId)?.attribute)
      .filter((attribute): attribute is string => attribute !== undefined),
  );
  const out: Facets = {};
  for (const [attribute, distribution] of Object.entries(baseline ?? {})) {
    const keepBaseline = selfFiltered.has(attribute);
    out[attribute] = Object.fromEntries(
      Object.keys(distribution ?? {}).map((key) => [key, live?.[attribute]?.[key] ?? (keepBaseline ? distribution[key] : 0)]),
    );
  }
  for (const [attribute, distribution] of Object.entries(live ?? {})) out[attribute] = { ...out[attribute], ...distribution };
  return out;
}

/**
 * Clears every filter. The tab and the sort are not filters — they are how the reader is looking at the
 * result — so "reset everything" keeps `view`, `sort` and `dir` whenever the current state is handed in.
 */
export function resetFilters(state?: FilterState): FilterState {
  const empty = emptyFilters();
  return state ? { ...empty, view: state.view, sort: state.sort, dir: state.dir } : empty;
}

/** Toggling a column takes the *effective* current sort as its starting point, not the raw (possibly
 * null) `state.sort`: with an empty query the list is already name-ascending by default
 * (`effectiveSortKey`), so a first click on "Имя" must flip straight to descending instead of
 * re-asserting the ascending order it's already showing. With a non-empty query and no explicit sort,
 * `effectiveSortKey` answers null (relevance order, no default) — no column looks "already sorted",
 * so the first click on any column, "Имя" included, starts ascending. */
export function setSort(state: FilterState, key: SortKey): FilterState {
  const dir: SortDir = effectiveSortKey(state) === key && state.dir === "asc" ? "desc" : "asc";
  return { ...state, sort: key, dir, page: 1 };
}

export function setView(state: FilterState, view: ExploreViewId): FilterState {
  return { ...state, view };
}

/** Every underlying code a slice represents: just its own key, unless it is a merged «неизвестно»
 * slice (`slicesFor`'s `mergeUnknown`), which carries the full `codes` list instead. The single place
 * the filter panel (DimensionEditor.tsx) goes from "which slice did the reader click" to "which URL
 * codes does that mean". */
export function sliceCodes(slice: Slice): string[] {
  return slice.codes ?? [slice.key];
}

/** A slice's checkbox is checked when ANY of its codes is in the current selection — not all of them —
 * so a URL that carries only one half of a merged pair (an old link, a hand-edited one) still shows the
 * merged option as checked instead of silently dropping it. */
export function isSliceChecked(slice: Slice, selected: string[]): boolean {
  return sliceCodes(slice).some((code) => selected.includes(code));
}

/** Turns a slice's checkbox on or off: adds or removes every one of its codes at once, so checking the
 * merged «неизвестно» option selects both `unknown` and `unrecognized` together and unchecking it clears
 * both, regardless of which of the pair (if either) was already selected. Existing selection order is
 * kept; newly added codes append in the slice's own order. */
export function toggleSlice(selected: string[], slice: Slice, on: boolean): string[] {
  const next = new Set(selected);
  for (const code of sliceCodes(slice)) {
    if (on) next.add(code);
    else next.delete(code);
  }
  return [...next];
}
