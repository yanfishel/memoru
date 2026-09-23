import { describe, expect, it } from "vitest";
import { assertBuildId, deriveBuildId, searchIndexName, servingSchemaName } from "../../../../scripts/etl/serving/build-id";

describe("deriveBuildId", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("prefers the sync checkpoint date", () => {
    expect(deriveBuildId({ syncUntil: "2026-09-30T23:10:00Z", importFinishedAt: "2026-09-16T03:00:00Z", now })).toBe("20260930");
  });
  it("falls back to the import date, then to now", () => {
    expect(deriveBuildId({ syncUntil: null, importFinishedAt: "2026-09-16T03:00:00Z", now })).toBe("20260916");
    expect(deriveBuildId({ syncUntil: null, importFinishedAt: null, now })).toBe("20261005");
  });
});

describe("assertBuildId", () => {
  it("accepts a date with an optional suffix and rejects anything else", () => {
    expect(() => assertBuildId("20260930")).not.toThrow();
    expect(() => assertBuildId("20260930_test")).not.toThrow();
    expect(() => assertBuildId("serving; drop")).toThrow(/build id/);
    expect(() => assertBuildId("2026-09-30")).toThrow(/build id/);
  });
  it("names the schema and the index", () => {
    expect(servingSchemaName("20260930")).toBe("serving_20260930");
    expect(searchIndexName("20260930")).toBe("people_20260930");
  });
});
