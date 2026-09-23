import { describe, expect, it } from "vitest";
import { parsePersonParam, personPath, personSlug } from "../../../src/lib/person-url";

describe("personSlug / personPath", () => {
  it("lower-cases the name and joins its words with hyphens", () => {
    expect(personSlug("Сафронов Илья Федорович")).toBe("сафронов-илья-федорович");
    expect(personPath(101, "Сафронов Илья Федорович")).toBe("/person/101-сафронов-илья-федорович");
  });
  it("drops punctuation and trims hyphens", () => {
    expect(personSlug("Де-Рибас (Рибас) Иосиф")).toBe("де-рибас-рибас-иосиф");
    expect(personSlug("  ")).toBe("");
    expect(personPath(7, "")).toBe("/person/7");
  });
  it("caps the slug length", () => {
    expect(personSlug("а".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("caps by code point, not UTF-16 code unit, so a surrogate pair is never split", () => {
    const slug = personSlug("а".repeat(79) + "𐌰" + "б".repeat(20));
    expect(() => encodeURI(slug)).not.toThrow();
    expect(Array.from(slug).length).toBeLessThanOrEqual(80);
  });
});

describe("parsePersonParam", () => {
  it("reads the id and the slug", () => {
    expect(parsePersonParam("101-сафронов-илья-федорович")).toEqual({ id: 101, slug: "сафронов-илья-федорович" });
    expect(parsePersonParam("101")).toEqual({ id: 101, slug: "" });
  });
  it("rejects anything that is not a positive 32-bit id", () => {
    expect(parsePersonParam("abc")).toBeNull();
    expect(parsePersonParam("0")).toBeNull();
    expect(parsePersonParam("99999999999")).toBeNull();
    expect(parsePersonParam("-5")).toBeNull();
  });
});
