import { describe, expect, it } from "vitest";
import { dimensionById } from "../../../src/lib/dimensions";
import { UI } from "../../../src/lib/ui-text";

describe("dimensions renames", () => {
  // "Регион рождения"/"Регион проживания" read as the region a record's source book of memory covers,
  // not necessarily where the person actually was born or lived; the map's own layer switcher
  // (UI.explore.mapLayer) already carries the wording the panel now matches (2026-09-18).
  it("titles birth_region and residence_region the same way the map layer switcher does", () => {
    expect(dimensionById("birth_region")!.titleRu).toBe("Место рождения");
    expect(dimensionById("residence_region")!.titleRu).toBe("Место жительства");
    expect(dimensionById("birth_region")!.titleRu).toBe(UI.explore.mapLayer.birth_region);
    expect(dimensionById("residence_region")!.titleRu).toBe(UI.explore.mapLayer.residence_region);
  });

  it("leaves the person page's own residence field alone — a different string about one address", () => {
    expect(UI.person.fields.residence).toBe("Место проживания");
  });
});
