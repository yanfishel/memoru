import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDictionaryCsv } from "../../../scripts/etl/normalize/dicts";
import { MAP_EXCEPTIONS, mapKey } from "../../../src/lib/map";
import { geoCodes } from "../../../src/lib/map-server";

function codesOf(file: string): string[] {
  return parseDictionaryCsv(file, readFileSync(`data/dicts/${file}.csv`, "utf8"))
    .entries()
    .map((e) => e.code);
}

describe("every dictionary code has a polygon or a documented exception", () => {
  it("regions", () => {
    const geo = geoCodes("regions");
    const missing = new Set<string>();
    for (const file of ["source_region", "birth_region", "residence_region"]) {
      for (const code of codesOf(file)) {
        const key = mapKey(code);
        if (!geo.has(key) && !MAP_EXCEPTIONS.includes(key)) missing.add(code);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("draws each capital city together with its oblast", () => {
    const geo = geoCodes("regions");
    expect(geo.has("RU-MOW")).toBe(true);
    expect(geo.has("RU-SPE")).toBe(true);
    // The oblasts are dissolved into the cities, so the collapsed counts paint the whole area.
    expect(geo.has("RU-MOS")).toBe(false);
    expect(geo.has("RU-LEN")).toBe(false);
  });

  it("countries", () => {
    const geo = geoCodes("countries");
    const missing = codesOf("birth_country").filter((c) => !geo.has(c) && !MAP_EXCEPTIONS.includes(c));
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});
