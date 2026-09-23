import { describe, expect, it } from "vitest";
import { normalizeKey } from "../../../scripts/etl/normalize/text";

describe("normalizeKey", () => {
  it.each([
    ["Мужчина", "мужчина"],
    ["  ВМН   (расстрел) ", "вмн (расстрел)"],
    ["Ёлкин", "елкин"],
    ["Челябинская обл.", "челябинская обл"],
    ["б/п;", "б/п"],
    ["a\u00a0b", "a b"],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeKey(raw)).toBe(expected);
  });
});
