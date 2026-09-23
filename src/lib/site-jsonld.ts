import { UI } from "./ui-text";

/**
 * schema.org `WebSite` for the home page. The `SearchAction` is the one piece of structured data that
 * matches what this site is for: it lets a search engine offer a name search straight from its own
 * result listing. `search_term_string` is schema.org's literal placeholder, not a value to fill in.
 */
export function websiteJsonLd(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: UI.siteName,
    alternateName: UI.siteTitle,
    url: `${base}/`,
    inLanguage: "ru",
    description: UI.meta.home,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}
