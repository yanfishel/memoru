import { describe, expect, it } from "vitest";
import { parseTitle } from "../../../scripts/etl/parse/title";

describe("parseTitle", () => {
  it("parses full name with year", () => {
    expect(parseTitle("Сафронов Илья Федорович (1892)")).toEqual({
      surname: "Сафронов",
      givenName: "Илья",
      patronymic: "Федорович",
      titleYear: 1892,
    });
  });

  it("handles missing patronymic and year ranges", () => {
    expect(parseTitle("Суворова Мария (1890—1937)")).toEqual({
      surname: "Суворова",
      givenName: "Мария",
      patronymic: null,
      titleYear: 1890,
    });
  });

  it("joins multi-word patronymics", () => {
    expect(parseTitle("Алиев Мамед Али оглы (1900)").patronymic).toBe("Али оглы");
  });

  it("handles a bare surname without year", () => {
    expect(parseTitle("Иванов")).toEqual({
      surname: "Иванов",
      givenName: null,
      patronymic: null,
      titleYear: null,
    });
  });

  it("treats underscores as spaces", () => {
    expect(parseTitle("Петров_Петр_Петрович_(1901)").givenName).toBe("Петр");
  });

  it("absorbs non-year parentheticals into name tokens", () => {
    expect(parseTitle("Иванов Иван (Ваня) Иванович (1900)")).toEqual({
      surname: "Иванов",
      givenName: "Иван",
      patronymic: "(Ваня) Иванович",
      titleYear: 1900,
    });
  });
});
