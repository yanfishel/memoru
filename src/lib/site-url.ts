/**
 * The public origin, for the sitemap, canonical links and JSON-LD. Read at call time, not at module load:
 * `next build` runs without SITE_URL (inside Docker) and must not bake localhost into the bundle.
 */
export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).href;
}
