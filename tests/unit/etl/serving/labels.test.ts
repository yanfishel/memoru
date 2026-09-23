import { describe, expect, it } from "vitest";
import { parseDictionaryCsv, type Dictionaries } from "../../../../scripts/etl/normalize/dicts";
import { expectedCodes, missingLabels, parseLabelsCsv } from "../../../../scripts/etl/serving/labels";

const CSV = `field,code,label_ru,sort_order
sex,m,мужчины,1
sex,f,женщины,2
sex,unknown,не указано,90
`;

describe("parseLabelsCsv", () => {
  it("parses rows", () => {
    expect(parseLabelsCsv(CSV)).toEqual([
      { field: "sex", code: "m", labelRu: "мужчины", sortOrder: 1 },
      { field: "sex", code: "f", labelRu: "женщины", sortOrder: 2 },
      { field: "sex", code: "unknown", labelRu: "не указано", sortOrder: 90 },
    ]);
  });

  it("rejects a bad header, duplicates, empty labels and bad sort orders", () => {
    expect(() => parseLabelsCsv("code,label\n")).toThrow(/header/);
    expect(() => parseLabelsCsv(CSV + "sex,m,again,3\n")).toThrow(/duplicate.*sex.*m/);
    expect(() => parseLabelsCsv(CSV + "sex,x,,4\n")).toThrow(/empty label/);
    expect(() => parseLabelsCsv(CSV + "sex,y,label,first\n")).toThrow(/sort_order/);
  });
});

function dictsWith(overrides: Partial<Record<keyof Dictionaries, string>>): Dictionaries {
  const fields = [
    "sex", "nationality", "education", "party", "sentence_type",
    "birth_country", "birth_region", "residence_region", "source_region",
  ] as const;
  return Object.fromEntries(
    fields.map((f) => [f, parseDictionaryCsv(f, overrides[f] ?? "raw_value,code,method,reviewed\n")]),
  ) as Dictionaries;
}

describe("expectedCodes and missingLabels", () => {
  it("lists dictionary codes with the most frequent raw value as the suggestion", () => {
    const dicts = dictsWith({
      nationality: "raw_value,code,method,reviewed\nрусский,russian,manual,true\nрусская,russian,manual,true\nнемец,german,manual,true\n",
    });
    const expected = expectedCodes(dicts);
    expect(expected).toContainEqual({ field: "nationality", code: "russian", suggestion: "русский" });
    expect(expected).toContainEqual({ field: "nationality", code: "german", suggestion: "немец" });
    expect(expected).toContainEqual({ field: "nationality", code: "unknown", suggestion: "не указано" });
    expect(expected).toContainEqual({ field: "nationality", code: "unrecognized", suggestion: "не распознано" });
  });

  it("includes the fixed code sets", () => {
    const expected = expectedCodes(dictsWith({}));
    for (const code of ["vmn", "itl", "vys", "zak", "pr", "other", "unknown", "unrecognized"]) {
      expect(expected.some((e) => e.field === "sentence_type" && e.code === code)).toBe(true);
    }
    for (const code of ["<18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"]) {
      expect(expected.some((e) => e.field === "age_bucket" && e.code === code)).toBe(true);
    }
    expect(expected.some((e) => e.field === "death_kind" && e.code === "executed")).toBe(true);
    expect(expected.some((e) => e.field === "rehabilitated" && e.code === "true")).toBe(true);
  });

  it("expects every birth_region code as a residence_region code too", () => {
    // normalize/person.ts resolveResidence falls back to the birth_region dictionary,
    // so residence_region_code can hold any birth_region code.
    const dicts = dictsWith({
      birth_region: "raw_value,code,method,reviewed\nТверская обл.,RU-TVE,manual,true\n",
      residence_region: "raw_value,code,method,reviewed\nМосква,RU-MOW,manual,true\n",
    });
    const expected = expectedCodes(dicts);
    expect(expected).toContainEqual({ field: "residence_region", code: "RU-TVE", suggestion: "Тверская обл." });
    expect(expected).toContainEqual({ field: "residence_region", code: "RU-MOW", suggestion: "Москва" });
  });

  it("keeps the residence-specific suggestion when both dictionaries carry the code", () => {
    const dicts = dictsWith({
      birth_region: "raw_value,code,method,reviewed\nг. Москва,RU-MOW,manual,true\n",
      residence_region: "raw_value,code,method,reviewed\nМосква,RU-MOW,manual,true\n",
    });
    expect(expectedCodes(dicts)).toContainEqual({ field: "residence_region", code: "RU-MOW", suggestion: "Москва" });
  });

  it("expects the country prefix of every birth_region code as a birth_country code", () => {
    // normalize/person.ts resolveBirthPlace falls back to the ISO country prefix of the
    // birth_region code when the birth_country dictionary does not recognize the place.
    const dicts = dictsWith({
      birth_region: "raw_value,code,method,reviewed\nЧО,RU-CHE,manual,true\nЛатвия,LV,manual,true\n",
    });
    const expected = expectedCodes(dicts);
    expect(expected).toContainEqual({ field: "birth_country", code: "RU", suggestion: "RU" });
    // A region code that is itself a country lends its raw value as the suggestion.
    expect(expected).toContainEqual({ field: "birth_country", code: "LV", suggestion: "Латвия" });
  });

  it("reports only codes without a label", () => {
    const expected = expectedCodes(dictsWith({}));
    const labels = parseLabelsCsv(CSV);
    const missing = missingLabels(expected, labels);
    expect(missing.some((m) => m.field === "sex" && m.code === "m")).toBe(false);
    expect(missing.some((m) => m.field === "sex" && m.code === "unrecognized")).toBe(true);
  });
});
