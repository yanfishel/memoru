import { parseFilters } from "@/lib/filters";
import { clientIp, searchLimiter } from "@/lib/rate-limit";
import { searchPeople } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const limit = searchLimiter.take(clientIp(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }
  const result = await searchPeople(parseFilters(new URL(request.url).searchParams));
  if (result.unavailable) return Response.json(result, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=60" } });
}
