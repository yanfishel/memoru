import { describe, expect, it } from "vitest";
import type { LabelMap } from "../../../src/db/queries";
import { chipsFor } from "../../../src/lib/filter-chips";
import { parseFilters } from "../../../src/lib/filters";

const labels: LabelMap = new Map([
  ["sex", new Map([["m", { labelRu: "мужчины", sortOrder: 1 }], ["f", { labelRu: "женщины", sortOrder: 2 }]])],
  ["sentence_type", new Map([["vmn", { labelRu: "расстрел", sortOrder: 1 }]])],
  ["nationality", new Map([["russian", { labelRu: "русские", sortOrder: 1 }], ["ukrainian", { labelRu: "украинцы", sortOrder: 2 }]])],
]);

describe("chipsFor", () => {
  it("makes one chip per dimension (values grouped), per year filter and for the query, in dimension order", () => {
    const state = parseFilters(new URLSearchParams("q=Иванов&sentence_type=vmn,unknown&sex=f&arrest_year=1937-1938,unknown&birth_year=-1900&death_year=1950-"));
    const chips = chipsFor(state, labels);
    expect(chips.map((c) => c.label)).toEqual([
      "Имя: Иванов",
      "Пол: женщины",
      "Год рождения: до 1900",
      "Год ареста: 1937–1938 + неизвестно",
      "Приговор: расстрел; неизвестно",
      "Год смерти: с 1950",
    ]);
    expect(chips[0].remove).toEqual({ kind: "q", q: "" });
    expect(chips[1].remove).toEqual({ kind: "codes", dimension: "sex", codes: [] });
    expect(chips[3].remove).toEqual({ kind: "year", dimension: "arrest_year", year: {} });
    expect(chips[4].remove).toEqual({ kind: "codes", dimension: "sentence_type", codes: [] });
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
  });

  it("merges unknown and unrecognized codes into a single «неизвестно» value in the chip, wherever it sits", () => {
    // Both codes present: collapses to one "неизвестно", at the position of the first one seen.
    expect(chipsFor(parseFilters(new URLSearchParams("sentence_type=unknown,vmn,unrecognized")), labels)[0].label).toBe(
      "Приговор: неизвестно; расстрел",
    );
    // Just "unrecognized" alone (no "unknown" in the URL) still reads «неизвестно», not «не распознано».
    expect(chipsFor(parseFilters(new URLSearchParams("sentence_type=unrecognized")), labels)[0].label).toBe("Приговор: неизвестно");
  });

  it("removing the merged chip clears both underlying codes, via the whole-dimension remove", () => {
    const state = parseFilters(new URLSearchParams("sentence_type=unknown,unrecognized"));
    const chips = chipsFor(state, labels);
    expect(chips[0].label).toBe("Приговор: неизвестно");
    expect(chips[0].remove).toEqual({ kind: "codes", dimension: "sentence_type", codes: [] });
  });

  it("renders a single selected value exactly as before", () => {
    const state = parseFilters(new URLSearchParams("sentence_type=vmn"));
    expect(chipsFor(state, labels)).toEqual([
      { id: "sentence_type", label: "Приговор: расстрел", remove: { kind: "codes", dimension: "sentence_type", codes: [] } },
    ]);
  });

  it("groups two values of one dimension into one chip, joined with '; ' in state order (not re-sorted)", () => {
    const state = parseFilters(new URLSearchParams("nationality=ukrainian,russian"));
    const chips = chipsFor(state, labels);
    expect(chips).toEqual([
      { id: "nationality", label: "Национальность: украинцы; русские", remove: { kind: "codes", dimension: "nationality", codes: [] } },
    ]);
  });

  it("keeps two dimensions with values each as two separate chips", () => {
    const state = parseFilters(new URLSearchParams("sex=f,m&nationality=russian,ukrainian"));
    const chips = chipsFor(state, labels);
    expect(chips.map((c) => c.label)).toEqual(["Пол: женщины; мужчины", "Национальность: русские; украинцы"]);
    expect(chips.map((c) => c.id)).toEqual(["sex", "nationality"]);
  });

  it("renders a year dimension and a grouped codes dimension side by side", () => {
    const state = parseFilters(new URLSearchParams("arrest_year=1937-1938&nationality=russian,ukrainian"));
    const chips = chipsFor(state, labels);
    expect(chips.map((c) => c.label)).toEqual(["Национальность: русские; украинцы", "Год ареста: 1937–1938"]);
    expect(chips[0].remove).toEqual({ kind: "codes", dimension: "nationality", codes: [] });
  });

  it("is empty for empty filters and labels an unknown code by its code", () => {
    expect(chipsFor(parseFilters(new URLSearchParams("")), labels)).toEqual([]);
    expect(chipsFor(parseFilters(new URLSearchParams("sex=x")), labels)[0].label).toBe("Пол: x");
  });
});
