interface Window {
  startedAt: number;
  count: number;
}

/** Fixed-window limiter per key, in process memory. One web instance serves the site (spec §4),
 * so this is enough to stop bulk scraping through the site's own API. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: { limit: number; windowMs: number; now?: () => number }) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  take(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    this.prune(now);
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count < this.limit) {
      current.count++;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return { allowed: false, retryAfterSeconds: Math.ceil((current.startedAt + this.windowMs - now) / 1000) };
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  // Caddy, the single trusted proxy in front of this app, appends the peer address as the
  // last entry; earlier entries are copied from the client-controlled request header, so
  // only the last one can be trusted as the actual connecting peer.
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export const searchLimiter = new RateLimiter({ limit: 60, windowMs: 60_000 });
