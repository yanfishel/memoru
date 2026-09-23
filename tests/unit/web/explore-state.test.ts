import { describe, expect, it } from "vitest";
import type { Slice } from "../../../src/lib/charts";
import { dimensionById } from "../../../src/lib/dimensions";
import { applyChange, facetSlices, isSliceChecked, resetFilters, setSort, sliceCodes, setView, toggleSlice, withBaseline } from "../../../src/lib/explore";
import { emptyFilters, parseFilters, serializeFilters } from "../../../src/lib/filters";

describe("applyChange", () => {
  it("toggles codes, sets years and resets the page", () => {
    let state = parseFilters(new URLSearchParams("page=4"));
    state = applyChange(state, { kind: "code", dimension: "sex", code: "m", on: true });
    expect(state.codes.sex).toEqual(["m"]);
    expect(state.page).toBe(1);
    state = applyChange(state, { kind: "code", dimension: "sex", code: "f", on: true });
    state = applyChange(state, { kind: "code", dimension: "sex", code: "m", on: false });
    expect(state.codes.sex).toEqual(["f"]);
    state = applyChange(state, { kind: "year", dimension: "arrest_year", year: { from: 1937, to: 1938, unknown: true } });
    expect(serializeFilters(state)).toBe("arrest_year=1937-1938%2Cunknown&sex=f");
    state = applyChange(state, { kind: "year", dimension: "arrest_year", year: {} });
    expect(state.years.arrest_year).toBeUndefined();
    expect(resetFilters()).toEqual(emptyFilters());
  });

  it("clears every filter but keeps the tab and the sort", () => {
    const state = parseFilters(new URLSearchParams("view=map&sort=name&sex=m&page=3"));
    expect(resetFilters(state)).toEqual({ ...emptyFilters(), view: "map", sort: "name" });
  });

  it("sets the trimmed name query and returns to the first page", () => {
    const state = applyChange(parseFilters(new URLSearchParams("page=4&sex=m")), { kind: "q", q: "  Иванов Иван  " });
    expect(state.q).toBe("Иванов Иван");
    expect(state.page).toBe(1);
    expect(state.codes.sex).toEqual(["m"]);
  });

  it("replaces a dimension's whole selection via codes, leaving other dimensions untouched", () => {
    let state = parseFilters(new URLSearchParams("page=4&sex=m"));
    state = applyChange(state, { kind: "codes", dimension: "nationality", codes: ["russian", "ukrainian"] });
    expect(state.codes.nationality).toEqual(["russian", "ukrainian"]);
    expect(state.codes.sex).toEqual(["m"]);
    expect(state.page).toBe(1);
    state = applyChange(state, { kind: "codes", dimension: "nationality", codes: ["german"] });
    expect(state.codes.nationality).toEqual(["german"]);
  });

  it("clears a dimension when codes is an empty array", () => {
    let state = parseFilters(new URLSearchParams("nationality=russian,ukrainian&sex=m"));
    state = applyChange(state, { kind: "codes", dimension: "nationality", codes: [] });
    expect(state.codes.nationality).toBeUndefined();
    expect(state.codes.sex).toEqual(["m"]);
  });
});

describe("withBaseline", () => {
  const baseline = { sex: { m: 30, f: 10 }, nationality: { russian: 25, german: 15 } };

  it("keeps unfiltered dimensions at their live counts, zeroes included", () => {
    const merged = withBaseline(baseline, { sex: { m: 30, f: 10 }, nationality: { russian: 25 } }, emptyFilters());
    expect(merged.nationality).toEqual({ russian: 25, german: 0 });
  });

  it("falls back to the baseline for the siblings a dimension's own filter zeroed", () => {
    const filters = { ...emptyFilters(), codes: { sex: ["m"] } };
    // Filtering on sex leaves Meilisearch counting only `m`; `f` keeps its baseline count so the
    // reader can still switch to it, while nationality — not filtered — honestly drops to zero.
    const merged = withBaseline(baseline, { sex: { m: 30 }, nationality: { russian: 25 } }, filters);
    expect(merged.sex).toEqual({ m: 30, f: 10 });
    expect(merged.nationality).toEqual({ russian: 25, german: 0 });
  });

  it("adds values the live response reports but the baseline never saw", () => {
    const merged = withBaseline(baseline, { sex: { m: 30, f: 10, unknown: 2 } }, emptyFilters());
    expect(merged.sex).toEqual({ m: 30, f: 10, unknown: 2 });
  });
});

describe("facetSlices", () => {
  it("turns a facet distribution into labelled slices", () => {
    const labels = new Map([["sex", new Map([["m", { labelRu: "мужчины", sortOrder: 1 }]])]]);
    const { slices, caveat } = facetSlices(dimensionById("sex")!, { sex: { m: 2, unknown: 1 } }, labels);
    expect(slices.map((s) => [s.label, s.count])).toEqual([
      ["мужчины", 2],
      ["не указано", 1],
    ]);
    // sex is a dimension without a coverage caveat, so nothing is reported for it.
    expect(caveat).toBeNull();
  });
});

describe("sliceCodes / isSliceChecked / toggleSlice", () => {
  const plain: Slice = { key: "russian", label: "русские", count: 25, unknown: false };
  const merged: Slice = { key: "unknown_merged", label: "неизвестно", count: 58, unknown: true, codes: ["unknown", "unrecognized"] };
  const single: Slice = { key: "unknown_merged", label: "неизвестно", count: 8, unknown: true, codes: ["unrecognized"] };

  it("sliceCodes falls back to the slice's own key when it carries no codes list", () => {
    expect(sliceCodes(plain)).toEqual(["russian"]);
    expect(sliceCodes(merged)).toEqual(["unknown", "unrecognized"]);
  });

  it("isSliceChecked is true when either underlying code is selected — an old URL with just one keeps working", () => {
    expect(isSliceChecked(merged, ["unknown"])).toBe(true);
    expect(isSliceChecked(merged, ["unrecognized"])).toBe(true);
    expect(isSliceChecked(merged, ["unknown", "unrecognized"])).toBe(true);
    expect(isSliceChecked(merged, ["russian"])).toBe(false);
    expect(isSliceChecked(single, ["unrecognized"])).toBe(true);
    expect(isSliceChecked(plain, ["russian"])).toBe(true);
  });

  it("toggleSlice on adds every underlying code at once", () => {
    expect(toggleSlice(["russian"], merged, true)).toEqual(["russian", "unknown", "unrecognized"]);
  });

  it("toggleSlice off removes every underlying code at once, regardless of which were present", () => {
    expect(toggleSlice(["russian", "unknown"], merged, false)).toEqual(["russian"]);
    expect(toggleSlice(["russian", "unknown", "unrecognized"], merged, false)).toEqual(["russian"]);
  });

  it("toggleSlice keeps existing selection order and appends new codes after it", () => {
    expect(toggleSlice(["german"], merged, true)).toEqual(["german", "unknown", "unrecognized"]);
  });
});

describe("setSort / setView", () => {
  it("sorts ascending on a new key, toggles direction on the same key, and returns to page 1", () => {
    let state = parseFilters(new URLSearchParams("page=3"));
    state = setSort(state, "birth_year");
    expect(state).toMatchObject({ sort: "birth_year", dir: "asc", page: 1 });
    state = { ...state, page: 2 };
    state = setSort(state, "birth_year");
    expect(state).toMatchObject({ sort: "birth_year", dir: "desc", page: 1 });
    state = setSort(state, "name");
    expect(state).toMatchObject({ sort: "name", dir: "asc" });
  });

  it("toggles straight to descending on a first click on the name column, since it's already the default ascending order", () => {
    const unsorted = parseFilters(new URLSearchParams(""));
    expect(unsorted.sort).toBeNull();
    expect(setSort(unsorted, "name")).toMatchObject({ sort: "name", dir: "desc", page: 1 });
    // A different column still starts ascending: the default order was never sorting by it.
    expect(setSort(unsorted, "birth_year")).toMatchObject({ sort: "birth_year", dir: "asc", page: 1 });
  });

  it("changes the view without touching the page", () => {
    const state = setView(parseFilters(new URLSearchParams("page=3")), "map");
    expect(state).toMatchObject({ view: "map", page: 3 });
  });

  it("keeps view and sort across a filter change", () => {
    const state = applyChange(parseFilters(new URLSearchParams("view=list&sort=name")), { kind: "code", dimension: "sex", code: "m", on: true });
    expect(state).toMatchObject({ view: "list", sort: "name", dir: "asc", page: 1 });
  });
});
