/**
 * The paging numbers the search, the URL parser and the result list all have to agree on.
 * This module imports nothing, so a client component can pull it in without dragging the
 * Meilisearch client or the database behind it into the browser bundle.
 */

export const PAGE_SIZE = 25;

/** Meilisearch's maxTotalHits (100,000, dev-index measured) caps how far paging can go:
 * totalHits/totalPages above it are exact, but requesting a page past it errors. */
export const MAX_PAGES = Math.floor(100_000 / PAGE_SIZE);
