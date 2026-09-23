import { afterEach, describe, expect, it } from "vitest";
import { absoluteUrl, siteUrl } from "../../../src/lib/site-url";

const original = process.env.SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = original;
});

describe("site-url", () => {
  it("defaults to localhost and strips a trailing slash", () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.SITE_URL = "https://example.org/";
    expect(siteUrl()).toBe("https://example.org");
  });
  it("percent-encodes Cyrillic paths", () => {
    process.env.SITE_URL = "https://example.org";
    expect(absoluteUrl("/person/101-сафронов")).toBe("https://example.org/person/101-%D1%81%D0%B0%D1%84%D1%80%D0%BE%D0%BD%D0%BE%D0%B2");
    expect(absoluteUrl("/sitemap.xml")).toBe("https://example.org/sitemap.xml");
  });
});
