import { describe, expect, it } from "vitest";
import { TERROR_YEARS, executedConfirmedCount, featuredStartId, isFeminine, trimmedYearRange, yearShare } from "../../../src/lib/home-view";

describe("yearShare", () => {
  it("divides the years in range by all known years, ignoring unknown rows", () => {
    const rows = [{ key: "1936", count: 10 }, { key: "1937", count: 60 }, { key: "1938", count: 20 }, { key: "1939", count: 10 }, { key: "unknown", count: 500 }];
    expect(yearShare(rows, TERROR_YEARS)).toEqual({ inRange: 80, known: 100, share: 0.8 });
  });
  it("is zero, not NaN, without data", () => {
    expect(yearShare([], TERROR_YEARS)).toEqual({ inRange: 0, known: 0, share: 0 });
    expect(yearShare([{ key: "unknown", count: 5 }], TERROR_YEARS)).toEqual({ inRange: 0, known: 0, share: 0 });
  });
});

describe("featuredStartId", () => {
  it("maps [0, 1) onto [1, maxId]", () => {
    expect(featuredStartId(0, 100)).toBe(1);
    expect(featuredStartId(0.5, 100)).toBe(51);
    expect(featuredStartId(0.999999, 100)).toBe(100);
  });
  it("never exceeds maxId or drops below 1", () => {
    expect(featuredStartId(1, 100)).toBe(100);
    expect(featuredStartId(-1, 100)).toBe(1);
    expect(featuredStartId(0.3, 0)).toBe(1);
  });
});

describe("executedConfirmedCount", () => {
  it("reads the aggregate value when the key is present", () => {
    expect(executedConfirmedCount({ persons: 2, executed_confirmed: 322774 })).toBe(322774);
  });
  it("is null, not 0, when the serving schema predates the key (rollback safety, spec §4.1)", () => {
    expect(executedConfirmedCount({ persons: 2, executed: 1, rehabilitated: 2 })).toBeNull();
    expect(executedConfirmedCount({})).toBeNull();
  });
});

describe("trimmedYearRange", () => {
  it("trims the trailing years below the threshold, keeping the start and any mid-range dip", () => {
    // Peak is 1937 (1000): 0.1% of it is 1. 1939 (2 >= 1) survives; 1940 (0 < 1) and 1941 (0 < 1) are
    // trimmed. 1938 dips to 0 (below the threshold) but sits before the last surviving year, so it
    // must stay — only the trailing end is ever trimmed.
    const rows = [
      { key: "1936", count: 5 }, { key: "1937", count: 1000 }, { key: "1938", count: 0 },
      { key: "1939", count: 2 }, { key: "1940", count: 0 }, { key: "1941", count: 0 },
    ];
    expect(trimmedYearRange(rows, [1936, 1941], 0.001)).toEqual([1936, 1939]);
  });

  it("trims nothing when the whole tail is already above the threshold", () => {
    const rows = [{ key: "1936", count: 5 }, { key: "1937", count: 1000 }, { key: "1938", count: 800 }];
    expect(trimmedYearRange(rows, [1936, 1938], 0.001)).toEqual([1936, 1938]);
  });

  it("trims nothing for all-zero rows — there is no peak to measure a tail against", () => {
    const rows = [{ key: "1936", count: 0 }, { key: "1937", count: 0 }, { key: "1938", count: 0 }];
    expect(trimmedYearRange(rows, [1936, 1938], 0.001)).toEqual([1936, 1938]);
  });

  it("never trims past the peak year, even with a threshold that would swallow everything else", () => {
    const rows = [{ key: "1936", count: 1 }, { key: "1937", count: 1000 }, { key: "1938", count: 1 }];
    expect(trimmedYearRange(rows, [1936, 1938], 2)).toEqual([1936, 1937]);
  });

  it("ignores unknown rows and years outside the given range", () => {
    const rows = [
      { key: "1936", count: 1000 }, { key: "1937", count: 1 }, { key: "unknown", count: 9999 },
      { key: "1935", count: 9999 }, { key: "1938", count: 9999 },
    ];
    expect(trimmedYearRange(rows, [1936, 1937], 0.001)).toEqual([1936, 1937]);
  });
});

describe("isFeminine", () => {
  it("is true only for \"f\"", () => {
    expect(isFeminine("f")).toBe(true);
  });
  it("takes the masculine (false) form for \"m\" and for unknown sex alike", () => {
    expect(isFeminine("m")).toBe(false);
    expect(isFeminine("unknown")).toBe(false);
  });
});
