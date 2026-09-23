import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Serving } from "../../../src/db/serving";

/**
 * `loadHomeData` reaches the database through `@/db/queries` and `@/db/serving`; mocking those two
 * boundaries lets this test drive the memo's own TTL logic (the thing under test here) without a
 * real Postgres. `vi.hoisted` is needed because `vi.mock` factories run before the top-level
 * `const`s below them.
 */
const { getSummaryMock, getBuildInfoMock, getLabelsMock, getDimensionMock, getMaxPersonIdMock, getFeaturedPersonMock, getActiveServingMock } = vi.hoisted(() => ({
  getSummaryMock: vi.fn(),
  getBuildInfoMock: vi.fn(),
  getLabelsMock: vi.fn(),
  getDimensionMock: vi.fn(),
  getMaxPersonIdMock: vi.fn(),
  getFeaturedPersonMock: vi.fn(),
  getActiveServingMock: vi.fn(),
}));

vi.mock("../../../src/db/queries", () => ({
  getSummary: getSummaryMock,
  getBuildInfo: getBuildInfoMock,
  getLabels: getLabelsMock,
  getDimension: getDimensionMock,
  getMaxPersonId: getMaxPersonIdMock,
  getFeaturedPerson: getFeaturedPersonMock,
}));
vi.mock("../../../src/db/serving", () => ({ getActiveServing: getActiveServingMock }));

const { loadHomeData } = await import("../../../src/lib/home");

const FAKE_SERVING = { schema: "serving_test" } as unknown as Serving;

beforeEach(() => {
  getSummaryMock.mockReset().mockResolvedValue({});
  getBuildInfoMock.mockReset().mockResolvedValue(null);
  getLabelsMock.mockReset().mockResolvedValue(new Map());
  getDimensionMock.mockReset().mockResolvedValue([]);
  getMaxPersonIdMock.mockReset().mockResolvedValue(null);
  getFeaturedPersonMock.mockReset().mockResolvedValue(null);
  getActiveServingMock.mockReset().mockResolvedValue(FAKE_SERVING);
});

describe("loadHomeData's memo", () => {
  it("reuses the same result within the TTL, resolves the active serving only once per fetch, refetches once the TTL elapses, and bypasses the memo entirely when a serving is passed explicitly", async () => {
    const hour = 60 * 60 * 1000;
    let now = 1_000_000;
    const clock = () => now;

    const first = await loadHomeData(undefined, 0, clock);
    expect(getActiveServingMock).toHaveBeenCalledTimes(1);

    now += hour - 1;
    const second = await loadHomeData(undefined, 0, clock);
    expect(second).toBe(first);
    expect(getActiveServingMock).toHaveBeenCalledTimes(1);

    now += 1;
    const third = await loadHomeData(undefined, 0, clock);
    expect(third).not.toBe(first);
    expect(getActiveServingMock).toHaveBeenCalledTimes(2);

    // An explicit `serving` (what every integration test passes) never touches the memo.
    getActiveServingMock.mockClear();
    await loadHomeData(FAKE_SERVING, 0, clock);
    await loadHomeData(FAKE_SERVING, 0, clock);
    expect(getActiveServingMock).not.toHaveBeenCalled();
    // One fetch per non-memoized call above: the two undefined-serving fetches (TTL start and
    // TTL elapsed) plus these two explicit-serving calls.
    expect(getSummaryMock).toHaveBeenCalledTimes(4);
  });
});
