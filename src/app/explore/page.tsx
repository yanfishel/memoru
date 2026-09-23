import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/ExploreView";
import { loadExplore } from "@/lib/explore";
import { searchParamsToQuery } from "@/lib/filters";
import { pageMetadata } from "@/lib/metadata";
import { UI } from "@/lib/ui-text";

/** The view is a function of the query string, so it is rendered per request, never cached. */
export const dynamic = "force-dynamic";
/** Canonical without the query and out of the index, the same rule robots.ts states: the filters make
    unbounded URL variants, and a filtered link shared on social should not become an indexed page. */
export const metadata: Metadata = pageMetadata({
  title: UI.explore.title,
  description: UI.meta.explore,
  path: "/explore",
  index: false,
});

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const data = await loadExplore(searchParamsToQuery(await searchParams));
  return (
    <>
      <h1>{UI.explore.title}</h1>
      <ExploreView initial={data} />
    </>
  );
}
