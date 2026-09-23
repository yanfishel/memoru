import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route calls both `revalidatePath` (Next's page cache) and `resetHomeMemo` (the module memo
 * the force-dynamic home page actually reads — see src/lib/home.ts). Mocking both boundaries lets
 * this test assert on the one that a careless refactor is most likely to drop, since removing it
 * causes no type error and no other test would catch it.
 */
const { revalidatePathMock, resetHomeMemoMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  resetHomeMemoMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../../../src/lib/home", () => ({ resetHomeMemo: resetHomeMemoMock }));

const { POST } = await import("../../../src/app/api/revalidate/route");

const SECRET = "test-secret";

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/revalidate", { method: "POST", headers });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    resetHomeMemoMock.mockReset();
    process.env.REVALIDATE_SECRET = SECRET;
  });

  it("clears the home page memo in addition to revalidating the Next cache", async () => {
    const response = await POST(request({ "x-revalidate-secret": SECRET }));

    expect(response.status).toBe(200);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    // This is the assertion that would fail if the resetHomeMemo() call were ever removed: the
    // home page no longer reads Next's page cache, so revalidatePath alone leaves it stale.
    expect(resetHomeMemoMock).toHaveBeenCalledTimes(1);
  });

  it("does not reset the memo when the secret is missing or wrong", async () => {
    delete process.env.REVALIDATE_SECRET;
    expect((await POST(request())).status).toBe(503);
    expect(resetHomeMemoMock).not.toHaveBeenCalled();

    process.env.REVALIDATE_SECRET = SECRET;
    expect((await POST(request({ "x-revalidate-secret": "wrong" }))).status).toBe(401);
    expect(resetHomeMemoMock).not.toHaveBeenCalled();
  });
});
