import type { Metadata } from "next";
import { SearchView } from "@/components/search/SearchView";
import { loadExplore } from "@/lib/explore";
import { searchParamsToQuery } from "@/lib/filters";
import { pageMetadata } from "@/lib/metadata";
import { UI } from "@/lib/ui-text";

/** Rendered per request from the query string, like /explore; the same loader serves both. */
export const dynamic = "force-dynamic";
/** Canonical without the query and out of the index, for the same reason as /explore. */
export const metadata: Metadata = pageMetadata({
  title: UI.search.title,
  description: UI.meta.search,
  path: "/search",
  index: false,
});

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const data = await loadExplore(searchParamsToQuery(await searchParams));
  return (
    <>
      <h1>{UI.search.title}</h1>
      <SearchView initial={data} />
    </>
  );
}
