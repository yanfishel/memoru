import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

/** Read at request time so SITE_URL comes from the container's environment, not from the build. */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    // /explore and /search are query-driven with unbounded URL variants; the home page and the person pages
    // are what a crawler needs.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/explore", "/search"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
