import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, FISHART_URL, GITHUB_REPO_URL, mailtoHref } from "../../../src/lib/external-links";

describe("external links", () => {
  it("pre-fills the mail subject, percent-encoded", () => {
    expect(mailtoHref("Открытый список: вопрос")).toBe(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Открытый список: вопрос")}`);
  });
  it("points at https addresses", () => {
    expect(GITHUB_REPO_URL).toMatch(/^https:\/\/github\.com\//);
    expect(FISHART_URL).toBe("https://fishart.co.il");
  });
});
