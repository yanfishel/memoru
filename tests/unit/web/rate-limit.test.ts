import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp } from "../../../src/lib/rate-limit";

describe("RateLimiter", () => {
  it("allows limit requests per window, then refuses with a retry-after", () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(limiter.take("a")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    limiter.take("a");
    limiter.take("a");
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.take("b").allowed).toBe(true);
    now = 61_000;
    expect(limiter.take("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for's last (proxy-appended) entry, then x-real-ip", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("10.0.0.1");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
