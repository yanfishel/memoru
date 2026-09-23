import { describe, expect, it } from "vitest";
import { formatInt, formatPercent, formatShareWords, formatYearRange, pluralRu, pluralRuGenitive } from "../../../src/lib/format";

describe("format", () => {
  it("groups thousands with narrow no-break spaces", () => {
    expect(formatInt(3285004)).toBe("3 285 004");
    expect(formatInt(0)).toBe("0");
  });
  it("formats shares as Russian percentages, with no space before the sign", () => {
    expect(formatPercent(0.4583)).toBe("45,8%");
    expect(formatPercent(1, 0)).toBe("100%");
  });
  it("formats year ranges", () => {
    expect(formatYearRange(1937, 1938)).toBe("1937–1938");
    expect(formatYearRange(1937, 1937)).toBe("1937");
  });
});

describe("formatShareWords", () => {
  it("rounds to whole percent and phrases the share, with no space before the sign", () => {
    expect(formatShareWords(0.5183)).toBe("52%");
    expect(formatShareWords(0)).toBe("0%");
  });
});

describe("pluralRu", () => {
  it("picks the Russian plural form", () => {
    const forms: [string, string, string] = ["год", "года", "лет"];
    expect([1, 2, 5, 11, 21, 22, 25, 101, 112].map((n) => pluralRu(n, forms))).toEqual([
      "год", "года", "лет", "лет", "год", "года", "лет", "год", "лет",
    ]);
  });
});

describe("pluralRuGenitive", () => {
  it("picks the genitive after a numeral phrase", () => {
    const forms: [string, string] = ["года", "лет"];
    expect([1, 11, 21, 22, 86, 101, 111, 0].map((n) => pluralRuGenitive(n, forms))).toEqual([
      "года", "лет", "года", "лет", "лет", "года", "лет", "лет",
    ]);
  });
});
