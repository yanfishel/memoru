import { getBuildInfo, getMaxPersonId, listPersonNames } from "@/db/queries";
import { getActiveServing } from "@/db/serving";
import { personPath } from "@/lib/person-url";
import { fullName } from "@/lib/person-view";
import { absoluteUrl } from "@/lib/site-url";
import { parseSitemapFile, renderUrlSet, sitemapChunkCount, sitemapChunkRange } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" };

export async function GET(_request: Request, { params }: RouteContext<"/sitemap/[file]">): Promise<Response> {
  const chunk = parseSitemapFile((await params).file);
  if (chunk === null) return new Response("not found", { status: 404 });
  const serving = await getActiveServing();
  if (chunk >= sitemapChunkCount(await getMaxPersonId(serving))) return new Response("not found", { status: 404 });
  const [info, names] = await Promise.all([getBuildInfo(serving), listPersonNames(serving, sitemapChunkRange(chunk))]);
  // Nothing tracks per-record change dates; the data date is when the whole build was taken.
  const lastmod = info?.dataDate ?? null;
  const entries = names.map((n) => ({ loc: absoluteUrl(personPath(n.id, fullName(n))), lastmod }));
  return new Response(renderUrlSet(entries), { headers: HEADERS });
}
