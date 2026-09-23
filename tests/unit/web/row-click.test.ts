import { describe, expect, it } from "vitest";
import { isPlainLeftClick } from "../../../src/lib/row-click";

describe("isPlainLeftClick", () => {
  it("is true only for an unmodified left click", () => {
    expect(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(true);
  });

  it("is false for any other button (middle/right)", () => {
    expect(isPlainLeftClick({ button: 1, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(false);
    expect(isPlainLeftClick({ button: 2, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(false);
  });

  it("is false when any modifier key is held, ctrl/meta included (new-tab clicks)", () => {
    expect(isPlainLeftClick({ button: 0, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(false);
    expect(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBe(false);
    expect(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: false, shiftKey: true, altKey: false })).toBe(false);
    expect(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: true })).toBe(false);
  });
});
