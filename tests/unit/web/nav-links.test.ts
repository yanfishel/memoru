import { describe, expect, it } from "vitest";
import { activeHref, NAV_LINKS } from "../../../src/components/shell/nav-links";

describe("activeHref", () => {
  it("matches a plain pathname", () => {
    expect(activeHref("/search", null)).toBe("/search");
  });

  it("picks the view-less explore link when no view is set", () => {
    expect(activeHref("/explore", null)).toBe("/explore");
  });

  it("picks the map link when the view matches", () => {
    expect(activeHref("/explore", "map")).toBe("/explore?view=map");
  });

  it("marks nothing active on a pathname no link owns", () => {
    expect(activeHref("/", null)).toBeNull();
  });
});

describe("NAV_LINKS", () => {
  it("lists the three header links with labels", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/search", "/explore", "/explore?view=map"]);
    expect(NAV_LINKS.every((l) => l.label.length > 0)).toBe(true);
  });
});
