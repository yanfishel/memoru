import { describe, expect, it } from "vitest";
import { DIMENSIONS, dimensionById } from "../../../src/lib/dimensions";
import { effectiveSortKey, facetAttributes, parseFilters, searchParamsToQuery, serializeFilters, SORT_KEYS, toMeiliFilter, toMeiliSort } from "../../../src/lib/filters";

describe("dimensions", () => {
  it("lists the fifteen dimensions in spec order, minus birth_country (retired from the filter UI)", () => {
    expect(DIMENSIONS.map((d) => d.id)).toEqual([
      "sex", "nationality", "birth_year", "arrest_year", "age_at_arrest", "sentence_type", "birth_region",
      "residence_region", "source_region", "death_year", "education", "party", "death_kind", "rehabilitated",
    ]);
    expect(dimensionById("age_at_arrest")).toMatchObject({ kind: "bucket", attribute: "age_at_arrest_bucket", labelField: "age_bucket" });
    expect(dimensionById("arrest_year")).toMatchObject({ kind: "year", attribute: "arrest_year", yearRange: [1917, 1991] });
  });
});

describe("parseFilters / serializeFilters", () => {
  it("round-trips codes, years and paging", () => {
    const state = parseFilters(new URLSearchParams("nationality=russian,german&sex=m&arrest_year=1937-1938&death_year=unknown&page=3&q=иванов"));
    expect(state).toEqual({
      codes: { nationality: ["russian", "german"], sex: ["m"] },
      years: { arrest_year: { from: 1937, to: 1938 }, death_year: { unknown: true } },
      q: "иванов",
      page: 3,
      view: "charts",
      sort: null,
      dir: "asc",
    });
    expect(serializeFilters(state)).toBe("arrest_year=1937-1938&death_year=unknown&nationality=russian%2Cgerman&page=3&q=%D0%B8%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2&sex=m");
  });

  it("ignores unknown keys and malformed values", () => {
    const state = parseFilters(new URLSearchParams("foo=bar&sex=m;DROP&arrest_year=abc&page=-2&birth_year=1900-"));
    expect(state).toEqual({ codes: {}, years: { birth_year: { from: 1900 } }, q: "", page: 1, view: "charts", sort: null, dir: "asc" });
  });

  it("clamps page to the Meilisearch maxTotalHits ceiling", () => {
    expect(parseFilters(new URLSearchParams("page=99999")).page).toBe(4000);
  });
});

describe("toMeiliFilter", () => {
  it("builds one validated clause per dimension", () => {
    const state = parseFilters(new URLSearchParams("sex=m,f&arrest_year=1937-1938&death_year=unknown&age_at_arrest=18-24,65%2B&birth_year=-1900"));
    expect(toMeiliFilter(state)).toEqual([
      'sex IN ["m","f"]',
      "birth_year <= 1900",
      "arrest_year >= 1937 AND arrest_year <= 1938",
      'age_at_arrest_bucket IN ["18-24","65+"]',
      "death_year IS NULL",
    ]);
  });

  it("ORs the unknown flag with a range", () => {
    const state = parseFilters(new URLSearchParams("arrest_year=1937-1938,unknown"));
    expect(toMeiliFilter(state)).toEqual(["(arrest_year >= 1937 AND arrest_year <= 1938) OR arrest_year IS NULL"]);
  });

  it("exposes the facet allowlist", () => {
    expect(facetAttributes()).toContain("source_region_code");
    expect(facetAttributes()).not.toContain("birth_country_code");
    expect(facetAttributes()).not.toContain("age_at_death_bucket");
    expect(facetAttributes()).toHaveLength(14);
  });

  it("emits an unquoted clause for a single boolean value", () => {
    const state = parseFilters(new URLSearchParams("rehabilitated=true"));
    expect(toMeiliFilter(state)).toEqual(["rehabilitated = true"]);
  });

  it("ORs both boolean values", () => {
    const state = parseFilters(new URLSearchParams("rehabilitated=true,false"));
    expect(toMeiliFilter(state)).toEqual(["(rehabilitated = true OR rehabilitated = false)"]);
  });

  it("drops a non-boolean value for a boolean dimension", () => {
    const state = parseFilters(new URLSearchParams("rehabilitated=maybe"));
    expect(toMeiliFilter(state)).toEqual([]);
  });
});

describe("searchParamsToQuery", () => {
  it("keeps strings, the first of repeated keys, and drops undefined", () => {
    const query = searchParamsToQuery({ q: "иванов", sex: ["m", "f"], page: undefined });
    expect(query.get("q")).toBe("иванов");
    expect(query.get("sex")).toBe("m");
    expect(query.has("page")).toBe(false);
  });
});

describe("view, sort and dir", () => {
  it("defaults to the charts view with no sort and omits the defaults from the URL", () => {
    const state = parseFilters(new URLSearchParams("sex=m"));
    expect(state).toMatchObject({ view: "charts", sort: null, dir: "asc" });
    expect(serializeFilters(state)).toBe("sex=m");
  });

  it("round-trips view, sort and dir and rejects unknown values", () => {
    const state = parseFilters(new URLSearchParams("view=map&sort=birth_year&dir=desc"));
    expect(state).toMatchObject({ view: "map", sort: "birth_year", dir: "desc" });
    expect(serializeFilters(state)).toBe("dir=desc&sort=birth_year&view=map");
    expect(parseFilters(new URLSearchParams("view=table&sort=age&dir=up"))).toMatchObject({ view: "charts", sort: null, dir: "asc" });
    // A direction on its own sorts nothing, so it is normalised away instead of riding along in the URL.
    const dirOnly = parseFilters(new URLSearchParams("dir=desc"));
    expect(dirOnly).toMatchObject({ sort: null, dir: "asc" });
    expect(serializeFilters(dirOnly)).toBe("");
  });

  it("builds a Meilisearch sort only for a supported key", () => {
    const state = parseFilters(new URLSearchParams("sort=name&dir=desc"));
    expect(toMeiliSort(state, SORT_KEYS)).toEqual(["surname:desc"]);
    expect(toMeiliSort(parseFilters(new URLSearchParams("sort=arrest_year")), ["name", "birth_year"])).toBeUndefined();
  });

  it("defaults an unsorted, query-less request to name ascending, when the index supports it", () => {
    // No `sort` in the URL: the list must still read alphabetically by surname (spec default), without
    // that default ever landing in the URL itself (parseFilters keeps `state.sort` null here).
    const unsorted = parseFilters(new URLSearchParams(""));
    expect(unsorted.sort).toBeNull();
    expect(toMeiliSort(unsorted, SORT_KEYS)).toEqual(["surname:asc"]);
    // An index built before name became sortable: no default to fall back on, same as before.
    expect(toMeiliSort(unsorted, ["birth_year"])).toBeUndefined();
  });

  it("sends no sort for an unsorted request with a name query, so relevance ranks the rows", () => {
    // Regression: INDEX_SETTINGS.rankingRules puts `sort` ahead of relevance (documents.ts), so
    // defaulting to `surname:asc` here — even for a query — would return "Абаев…", "Абакумов…" instead
    // of the actual name matches. The alphabetical default only makes sense with nothing to rank by.
    const queried = parseFilters(new URLSearchParams("q=максимов"));
    expect(queried.sort).toBeNull();
    expect(toMeiliSort(queried, SORT_KEYS)).toBeUndefined();
  });

  it("keeps an explicit sort for a query, query or not", () => {
    const explicit = parseFilters(new URLSearchParams("q=максимов&sort=birth_year&dir=desc"));
    expect(toMeiliSort(explicit, SORT_KEYS)).toEqual(["birth_year:desc"]);
  });
});

describe("effectiveSortKey", () => {
  it("is the reader's explicit choice, or name (the default order) when the query is empty", () => {
    expect(effectiveSortKey(parseFilters(new URLSearchParams("")))).toBe("name");
    expect(effectiveSortKey(parseFilters(new URLSearchParams("sort=arrest_year")))).toBe("arrest_year");
  });

  it("is null for a non-empty query with no explicit sort — relevance decides, not the default", () => {
    expect(effectiveSortKey(parseFilters(new URLSearchParams("q=иванов")))).toBeNull();
    // An explicit choice still wins over the query.
    expect(effectiveSortKey(parseFilters(new URLSearchParams("q=иванов&sort=birth_year")))).toBe("birth_year");
  });
});
