import { describe, expect, it } from "vitest";
import { encodeCopyRow, encodeCopyValue } from "../../../scripts/etl/db/copy";

describe("encodeCopyValue", () => {
  it("encodes nulls", () => {
    expect(encodeCopyValue(null)).toBe("\\N");
    expect(encodeCopyValue(undefined)).toBe("\\N");
  });

  it("escapes backslash, tab, newline and carriage return in strings", () => {
    expect(encodeCopyValue("a\\b\tc\nd\re")).toBe("a\\\\b\\tc\\nd\\re");
  });

  it("encodes numbers and booleans", () => {
    expect(encodeCopyValue(42)).toBe("42");
    expect(encodeCopyValue(true)).toBe("t");
    expect(encodeCopyValue(false)).toBe("f");
  });

  it("encodes text arrays as quoted array literals", () => {
    expect(encodeCopyValue(["Башкирия", 'a"b', "c\\d"])).toBe('{"Башкирия","a\\\\"b","c\\\\\\\\d"}');
  });

  it("encodes objects as JSON", () => {
    expect(encodeCopyValue({ "пол": "мужчина", note: "x\ty" })).toBe('{"пол":"мужчина","note":"x\\\\ty"}');
  });
});

describe("encodeCopyRow", () => {
  it("joins with tabs and ends with a newline", () => {
    expect(encodeCopyRow([1, "a", null])).toBe("1\ta\t\\N\n");
  });
});
