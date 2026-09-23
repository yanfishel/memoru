import "server-only";

/**
 * `photoUrl` alone, split out of `person-view.ts` so its `node:crypto` import can never reach a
 * client bundle: `person-view.ts` is value-imported by client modules (`ResultTable.tsx`,
 * `filter-chips.ts`, all via `labelOf`), and Next silently polyfills `node:crypto` with
 * `crypto-browserify` for the browser rather than failing the build, which had made every page that
 * pulls in those modules (`/explore`, `/search`) ship an extra ~536 KB chunk it never needed.
 * `import "server-only"` (the same guard `src/lib/search.ts` uses) turns a future regression into a
 * build error instead of a silent bundle-size regression.
 */
import { createHash } from "node:crypto";

/**
 * MediaWiki's file storage layout: a file lives at `/images/<h0>/<h0h1>/<name>`, where `name` is the
 * file title after MediaWiki's own normalisation — runs of whitespace/underscores collapsed to a
 * single underscore, first character uppercased — and `h` is the md5 hex digest of that normalised
 * name (verified against the live wiki). `staging.person.photo_file` is kept verbatim; this function
 * normalises only the string used to build the URL, never the stored value.
 */
export function photoUrl(fileName: string): string {
  const collapsed = fileName.replace(/[\s_]+/g, "_");
  const chars = Array.from(collapsed);
  const normalized = chars.length > 0 ? chars[0].toUpperCase() + chars.slice(1).join("") : collapsed;
  const hash = createHash("md5").update(normalized, "utf8").digest("hex");
  return `https://ru.openlist.wiki/images/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(normalized)}`;
}
