import { getMaxPersonId } from "@/db/queries";
import { getActiveServing } from "@/db/serving";
import { absoluteUrl } from "@/lib/site-url";
import { renderSitemapIndex, sitemapChunkCount } from "@/lib/sitemap";

/** Follows the active build: a publish changes max(id) and the chunk count between one request and the next. */
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" };

export async function GET(): Promise<Response> {
  const serving = await getActiveServing();
  const count = sitemapChunkCount(await getMaxPersonId(serving));
  const locs = Array.from({ length: count }, (_, chunk) => absoluteUrl(`/sitemap/${chunk}.xml`));
  return new Response(renderSitemapIndex(locs), { headers: HEADERS });
}
