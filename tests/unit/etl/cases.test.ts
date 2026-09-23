import { describe, expect, it } from "vitest";
import { splitCases } from "../../../scripts/etl/parse/cases";

describe("splitCases", () => {
  it("groups numbered keys into ordered cases", () => {
    const result = splitCases({
      "пол": "мужчина",
      "дата ареста 2": "01.01.1949",
      "дата ареста 1": "27.03.1938",
      "приговор 1": "10 лет ИТЛ",
      "статья 1": "58-6-9-11",
      "расстрел": "17.10.1938",
    });
    expect(result).toEqual({
      person: { "пол": "мужчина", "расстрел": "17.10.1938" },
      cases: [
        { n: 1, params: { "дата ареста": "27.03.1938", "приговор": "10 лет ИТЛ", "статья": "58-6-9-11" } },
        { n: 2, params: { "дата ареста": "01.01.1949" } },
      ],
    });
  });

  it("returns no cases when there are no numbered keys", () => {
    expect(splitCases({ "пол": "женщина" })).toEqual({ person: { "пол": "женщина" }, cases: [] });
  });

  it("orders case numbers numerically, not lexicographically", () => {
    const result = splitCases({
      "дата ареста 2": "01.01.1949",
      "дата ареста 10": "15.06.1950",
    });
    expect(result.cases.map((c) => c.n)).toEqual([2, 10]);
  });

  it("treats a number above the case ceiling as part of the key, not a case index", () => {
    const result = splitCases({
      "место проживания до 1930": "г. Москва",
      "место проживания после 1930": "г. Ленинград",
    });
    expect(result).toEqual({
      person: {
        "место проживания до 1930": "г. Москва",
        "место проживания после 1930": "г. Ленинград",
      },
      cases: [],
    });
  });

  it("still treats the ceiling itself as a valid case number", () => {
    const result = splitCases({ "дата ареста 50": "01.01.1940" });
    expect(result).toEqual({
      person: {},
      cases: [{ n: 50, params: { "дата ареста": "01.01.1940" } }],
    });
  });
});
