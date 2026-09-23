import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiHttpError, ApiPausedError } from "../../../../scripts/etl/api/client";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function makeClient(responses: Response[], overrides: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; headers: Record<string, string>; hasSignal: boolean }> = [];
  const sleeps: number[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      hasSignal: init?.signal instanceof AbortSignal,
    });
    const next = responses.shift();
    if (!next) throw new Error("no more canned responses");
    return next;
  }) as unknown as typeof fetch;
  const client = new ApiClient({
    endpoint: "https://wiki.example/api.php",
    userAgent: "memoru-test/1.0 (contact@example)",
    minIntervalMs: 1000,
    fetchImpl,
    sleepImpl: async (ms: number) => {
      sleeps.push(ms);
    },
    ...overrides,
  });
  return { client, calls, sleeps };
}

describe("ApiClient", () => {
  it("sends action, format, maxlag and the user agent", async () => {
    const { client, calls } = makeClient([jsonResponse({ query: { ok: true } })]);
    await client.query({ list: "allrevisions", arvlimit: "500" });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://wiki.example/api.php");
    expect(url.searchParams.get("action")).toBe("query");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("maxlag")).toBe("5");
    expect(url.searchParams.get("list")).toBe("allrevisions");
    expect(calls[0].headers["user-agent"]).toBe("memoru-test/1.0 (contact@example)");
    expect(calls[0].hasSignal).toBe(true);
  });

  it("paces consecutive requests by the minimum interval", async () => {
    const { client, sleeps } = makeClient([
      jsonResponse({ query: {} }),
      jsonResponse({ query: {} }),
    ]);
    await client.query({ list: "a" });
    await client.query({ list: "b" });
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(0);
    expect(sleeps[0]).toBeLessThanOrEqual(1000);
    expect(client.requestCount).toBe(2);
  });

  it("retries a maxlag error and succeeds", async () => {
    const { client, sleeps } = makeClient([
      jsonResponse({ error: { code: "maxlag", info: "Waiting for a database server: 7 seconds lagged." } }),
      jsonResponse({ ok: true }),
    ]);
    const result = (await client.query({ list: "a" })) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sleeps.some((ms) => ms >= 1000)).toBe(true);
  });

  it("honours Retry-After on 503", async () => {
    const { client, sleeps } = makeClient([
      jsonResponse({}, { status: 503, headers: { "retry-after": "3" } }),
      jsonResponse({ query: { ok: true } }),
    ]);
    await client.query({ list: "a" });
    expect(sleeps).toContain(3000);
  });

  it("aborts with ApiPausedError instead of sleeping for a long Retry-After", async () => {
    const { client, calls, sleeps } = makeClient([
      jsonResponse({}, { status: 503, headers: { "retry-after": "10800" } }),
    ]);
    let error: unknown;
    try {
      await client.query({ list: "a" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiPausedError);
    expect((error as ApiPausedError).retryAfterMs).toBe(10_800_000);
    expect(calls.length).toBe(1);
    expect(sleeps.length).toBe(0);
  });

  it("retries a 503 with a Retry-After under the cap and succeeds", async () => {
    const { client, sleeps } = makeClient([
      jsonResponse({}, { status: 503, headers: { "retry-after": "120" } }),
      jsonResponse({ query: { ok: true } }),
    ]);
    await client.query({ list: "a" });
    expect(sleeps).toContain(120_000);
  });

  it("throws a descriptive error for a non-maxlag API error", async () => {
    const { client } = makeClient([
      jsonResponse({ error: { code: "badvalue", info: "Unrecognized value for parameter." } }),
    ]);
    await expect(client.query({ list: "a" })).rejects.toThrow(/badvalue: Unrecognized value/);
  });

  it("reports a maxlag retry via onRetry", async () => {
    const events: Array<{ reason: string; attempt: number; delayMs: number }> = [];
    const { client } = makeClient(
      [
        jsonResponse({ error: { code: "maxlag", info: "Waiting for a database server: 7 seconds lagged." } }),
        jsonResponse({ ok: true }),
      ],
      { onRetry: (e: { reason: string; attempt: number; delayMs: number }) => events.push(e) },
    );
    await client.query({ list: "a" });
    expect(events.length).toBe(1);
    expect(events[0].reason).toMatch(/^maxlag/);
    expect(events[0].delayMs).toBeGreaterThanOrEqual(1000);
  });

  it("reports a 503 retry via onRetry with the Retry-After delay", async () => {
    const events: Array<{ reason: string; attempt: number; delayMs: number }> = [];
    const { client } = makeClient(
      [
        jsonResponse({}, { status: 503, headers: { "retry-after": "3" } }),
        jsonResponse({ query: { ok: true } }),
      ],
      { onRetry: (e: { reason: string; attempt: number; delayMs: number }) => events.push(e) },
    );
    await client.query({ list: "a" });
    expect(events).toEqual([{ reason: "http 503", attempt: 0, delayMs: 3000 }]);
  });

  it("retries a 502 and succeeds", async () => {
    const events: Array<{ reason: string; attempt: number; delayMs: number }> = [];
    const { client } = makeClient(
      [
        jsonResponse({}, { status: 502 }),
        jsonResponse({ query: { ok: true } }),
      ],
      { onRetry: (e: { reason: string; attempt: number; delayMs: number }) => events.push(e) },
    );
    const result = (await client.query({ list: "a" })) as { query: { ok: boolean } };
    expect(result.query.ok).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].reason).toBe("http 502");
  });

  it("rejects with an ApiHttpError for a non-retried HTTP status", async () => {
    const { client } = makeClient([
      jsonResponse({}, { status: 500 }),
      jsonResponse({}, { status: 500 }),
    ]);
    await expect(client.query({ list: "a" })).rejects.toBeInstanceOf(ApiHttpError);
    await expect(client.query({ list: "a" })).rejects.toMatchObject({ status: 500 });
  });

  it("gives up after the retry budget", async () => {
    const { client } = makeClient(
      [
        jsonResponse({}, { status: 503 }),
        jsonResponse({}, { status: 503 }),
        jsonResponse({}, { status: 503 }),
      ],
      { maxRetries: 2 },
    );
    await expect(client.query({ list: "a" })).rejects.toThrow(/after 2 retries/);
  });

  it("retries a request that fails (e.g. a timeout) and succeeds", async () => {
    const events: Array<{ reason: string; attempt: number; delayMs: number }> = [];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return jsonResponse({ query: { ok: true } });
    }) as unknown as typeof fetch;
    const client = new ApiClient({
      endpoint: "https://wiki.example/api.php",
      userAgent: "memoru-test/1.0 (contact@example)",
      minIntervalMs: 1000,
      fetchImpl,
      sleepImpl: async () => {},
      onRetry: (e) => events.push(e),
    });

    const result = (await client.query({ list: "a" })) as { query: { ok: boolean } };
    expect(result.query.ok).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].reason).toMatch(/^request failed/);
  });

  it("gives up after the retry budget when the request keeps failing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof fetch;
    const client = new ApiClient({
      endpoint: "https://wiki.example/api.php",
      userAgent: "memoru-test/1.0 (contact@example)",
      minIntervalMs: 1000,
      fetchImpl,
      sleepImpl: async () => {},
      maxRetries: 1,
    });

    await expect(client.query({ list: "a" })).rejects.toThrow(/after 1 retries/);
  });
});
