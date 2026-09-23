import { getBuildInfo } from "@/db/queries";
import { getActiveServing } from "@/db/serving";

/** Read per request: the point of the check is the state right now, not at build time. */
export const dynamic = "force-dynamic";

/**
 * What a deploy and an uptime monitor ask. 200 means a build is live and the app can reach it;
 * 503 means the stack is up with nothing to serve — an empty serving slot right after the first
 * `docker compose up`, or Postgres not answering. The error is never echoed back: it would carry
 * DATABASE_URL, password included.
 */
export async function GET(): Promise<Response> {
  try {
    // maxAgeMs 0 defeats the 5 s slot cache: a health check that answers from a cache can report a
    // build that has just been swapped away.
    const serving = await getActiveServing({ maxAgeMs: 0 });
    const info = await getBuildInfo(serving);
    return Response.json({ ok: true, schema: serving.schema, index: serving.searchIndex, dataDate: info?.dataDate ?? null });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
