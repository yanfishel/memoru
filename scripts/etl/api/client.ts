export const DEFAULT_ENDPOINT = "https://ru.openlist.wiki/api.php";

export interface ApiClientOptions {
  endpoint: string;
  userAgent: string;
  /** Minimum gap between requests. This wiki runs MediaWiki 1.30 on PHP 5.6; be gentle. */
  minIntervalMs?: number;
  maxRetries?: number;
  maxlag?: number;
  /** Per-request timeout, aborting the fetch if the server never responds. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  onRetry?: (event: RetryEvent) => void;
}

export interface RetryEvent {
  reason: string;
  attempt: number;
  delayMs: number;
}

interface ApiError {
  code?: string;
  info?: string;
}

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

/** A Retry-After above this is not worth sleeping through; abort the run instead. */
export const MAX_RETRY_AFTER_MS = 300_000;

export class ApiPausedError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "ApiPausedError";
    this.retryAfterMs = retryAfterMs;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ApiClient {
  private readonly endpoint: string;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly maxlag: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly onRetry?: (event: RetryEvent) => void;
  private lastRequestAt = 0;
  private requests = 0;

  constructor(options: ApiClientOptions) {
    this.endpoint = options.endpoint;
    this.userAgent = options.userAgent;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 5;
    this.maxlag = options.maxlag ?? 5;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? defaultSleep;
    this.onRetry = options.onRetry;
  }

  get requestCount(): number {
    return this.requests;
  }

  async query(params: Record<string, string>): Promise<unknown> {
    const url = new URL(this.endpoint);
    for (const [key, value] of Object.entries({
      ...params,
      action: "query",
      format: "json",
      maxlag: String(this.maxlag),
    })) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; ; attempt++) {
      await this.pace();
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { "user-agent": this.userAgent },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        this.requests++;
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= this.maxRetries) {
          throw new Error(
            `API request failed after ${this.maxRetries} retries: ${name}: ${message}: ${url.searchParams}`,
          );
        }
        const delayMs = this.retryDelay(undefined, attempt);
        this.onRetry?.({ reason: `request failed: ${name}`, attempt, delayMs });
        await this.sleepImpl(delayMs);
        continue;
      }
      this.requests++;

      if (
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        const headerDelayMs = this.headerRetryAfterMs(response);
        if (headerDelayMs !== undefined && headerDelayMs > MAX_RETRY_AFTER_MS) {
          const seconds = headerDelayMs / 1000;
          throw new ApiPausedError(
            `API asked to retry after ${seconds} s (HTTP ${response.status}); stop and re-run later: ${url.searchParams}`,
            headerDelayMs,
          );
        }
        if (attempt >= this.maxRetries) {
          throw new Error(`API returned ${response.status} after ${this.maxRetries} retries: ${url.searchParams}`);
        }
        const delayMs = this.retryDelay(response, attempt);
        this.onRetry?.({ reason: `http ${response.status}`, attempt, delayMs });
        await this.sleepImpl(delayMs);
        continue;
      }
      if (!response.ok) {
        throw new ApiHttpError(response.status, `API returned HTTP ${response.status}: ${url.searchParams}`);
      }

      const body = (await response.json()) as { error?: ApiError; query?: unknown; continue?: unknown };
      if (body.error) {
        if (body.error.code === "maxlag") {
          if (attempt >= this.maxRetries) {
            throw new Error(`API still lagged after ${this.maxRetries} retries: ${body.error.info ?? ""}`);
          }
          const delayMs = this.retryDelay(response, attempt);
          const reason = body.error.info ? `maxlag: ${body.error.info}` : "maxlag";
          this.onRetry?.({ reason, attempt, delayMs });
          await this.sleepImpl(delayMs);
          continue;
        }
        throw new Error(`API error ${body.error.code}: ${body.error.info ?? "no info"}`);
      }
      return body;
    }
  }

  private retryDelay(response: Response | undefined, attempt: number): number {
    const fromHeader = response ? this.headerRetryAfterMs(response) : undefined;
    if (fromHeader !== undefined) return fromHeader;
    return Math.min(this.minIntervalMs * 2 ** attempt, 60_000);
  }

  private headerRetryAfterMs(response: Response): number | undefined {
    const header = response.headers.get("retry-after");
    const ms = header ? Number(header) * 1000 : NaN;
    return Number.isFinite(ms) && ms > 0 ? ms : undefined;
  }

  private async pace(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + this.minIntervalMs - now;
    if (wait > 0) await this.sleepImpl(wait);
    this.lastRequestAt = Date.now();
  }
}
