import { describe, expect, it } from "vitest";
import { renderValuesCsv } from "../../../scripts/etl/values";

describe("renderValuesCsv", () => {
  it("writes a header and quotes values with commas", () => {
    expect(
      renderValuesCsv([
        { rawValue: "ЧО, Троицкий р-н", count: 3, code: "" },
        { rawValue: "мужчина", count: 2, code: "m" },
      ]),
    ).toBe('raw_value,count,code\n"ЧО, Троицкий р-н",3,\nмужчина,2,m\n');
  });
});
