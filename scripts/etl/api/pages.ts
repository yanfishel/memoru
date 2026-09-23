import type { ApiClient } from "./client";

export interface FetchedPage {
  pageId: number;
  title: string;
  revId: number;
  revTimestamp: string;
  text: string;
}

export interface FetchResult {
  pages: FetchedPage[];
  /** Ids the API explicitly flagged as missing (a `missing` entry keyed by the requested pageid). */
  missing: number[];
  /** Requested ids absent from the response, or present but without usable revision text: never delete on these. */
  unresolved: number[];
}

/** MediaWiki 1.30 has no rvslots; revision text is revisions[0]["*"]. */
interface ApiRevision {
  revid: number;
  timestamp: string;
  "*"?: string;
}

interface ApiPage {
  pageid?: number;
  title?: string;
  missing?: string;
  revisions?: ApiRevision[];
}

interface PagesBody {
  query?: { pages?: Record<string, ApiPage> };
}

const DEFAULT_BATCH = 50;

export async function fetchPages(
  client: ApiClient,
  pageIds: number[],
  options: { batchSize?: number; onProgress?: (done: number) => void } = {},
): Promise<FetchResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const pages: FetchedPage[] = [];
  const found = new Set<number>();
  const missing = new Set<number>();

  for (let i = 0; i < pageIds.length; i += batchSize) {
    const batch = pageIds.slice(i, i + batchSize);
    const body = (await client.query({
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      pageids: batch.join("|"),
    })) as PagesBody;

    for (const page of Object.values(body.query?.pages ?? {})) {
      if (page.missing !== undefined) {
        // MediaWiki keys a missing page by its requested id and includes that id as
        // `pageid` when asked via `pageids=`, so this is an explicit not-found, not
        // a transient gap in the response.
        if (page.pageid !== undefined) missing.add(page.pageid);
        continue;
      }
      if (page.pageid === undefined || page.title === undefined) continue;
      const revision = page.revisions?.[0];
      if (!revision || revision["*"] === undefined) continue;
      found.add(page.pageid);
      pages.push({
        pageId: page.pageid,
        title: page.title,
        revId: revision.revid,
        revTimestamp: revision.timestamp,
        text: revision["*"],
      });
    }
    options.onProgress?.(Math.min(i + batchSize, pageIds.length));
  }

  // Anything neither found nor explicitly reported missing is unresolved: absent
  // from the response entirely (e.g. a query-less body for a whole batch), or
  // present without revision text. Callers must not treat this as a deletion.
  const unresolved = pageIds.filter((id) => !found.has(id) && !missing.has(id));
  return { pages, missing: [...missing], unresolved };
}
