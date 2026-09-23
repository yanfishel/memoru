import { revalidatePath } from "next/cache";
import { resetHomeMemo } from "@/lib/home";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: "REVALIDATE_SECRET is not set" }, { status: 503 });
  if (request.headers.get("x-revalidate-secret") !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  revalidatePath("/");
  // The home page is force-dynamic and reads src/lib/home.ts's own memo, not Next's page cache, so
  // revalidatePath above never touches what it actually serves. Without this, a swap would leave
  // the home page showing the previous build for up to an hour (see resetHomeMemo's comment).
  resetHomeMemo();
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
