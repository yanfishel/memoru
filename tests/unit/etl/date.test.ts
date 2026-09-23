import { describe, expect, it } from "vitest";
import { parseRuDate } from "../../../scripts/etl/parse/date";

describe("parseRuDate", () => {
  it.each([
    ["1903", { year: 1903, month: null, day: null, precision: "y" }],
    ["1938 г.", { year: 1938, month: null, day: null, precision: "y" }],
    ["в 1921 г.", { year: 1921, month: null, day: null, precision: "y" }],
    ["1937 года", { year: 1937, month: null, day: null, precision: "y" }],
    ["16.04.1938", { year: 1938, month: 4, day: 16, precision: "f" }],
    ["1.2.1938.", { year: 1938, month: 2, day: 1, precision: "f" }],
    ["04.1938", { year: 1938, month: 4, day: null, precision: "m" }],
    ["11 июня 1931 г.", { year: 1931, month: 6, day: 11, precision: "f" }],
    ["18 сентября 1932 г.", { year: 1932, month: 9, day: 18, precision: "f" }],
    ["в сентябре 1937 г.", { year: 1937, month: 9, day: null, precision: "m" }],
    ["май 1938", { year: 1938, month: 5, day: null, precision: "m" }],
    ["3 мая 1938", { year: 1938, month: 5, day: 3, precision: "f" }],
    ["  17.10.1938  ", { year: 1938, month: 10, day: 17, precision: "f" }],
  ])("parses %j", (raw, expected) => {
    expect(parseRuDate(raw)).toEqual(expected);
  });

  it.each([
    [undefined],
    [""],
    ["неизвестно"],
    ["31.02.1938"],
    ["16.13.1938"],
    ["1700"],
    ["1937-1938"],
    ["в 30-е годы"],
    ["16 брюмера 1938"],
  ])("returns null for %j", (raw) => {
    expect(parseRuDate(raw)).toBeNull();
  });
});
