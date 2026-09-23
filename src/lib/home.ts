import "server-only";

import { getBuildInfo, getDimension, getFeaturedPerson, getLabels, getMaxPersonId, getSummary, type FeaturedPerson, type LabelMap } from "@/db/queries";
import { getActiveServing, type Serving } from "@/db/serving";
import { slicesFor, type Slice } from "./charts";
import { dimensionById } from "./dimensions";
import { TERROR_YEARS, featuredStartId, yearShare } from "./home-view";

export interface ChartData {
  slices: Slice[];
  caveat: string | null;
}

export interface HomeData {
  summary: Record<string, number>;
  dataDate: string | null;
  sex: ChartData;
  sentence: ChartData;
  arrestsByYear: { rows: Array<{ key: string; count: number }>; unknownCount: number };
  /** Spec §3.6 chapter 1: the Great Terror's share of all records with a known arrest year. */
  terror: { from: number; to: number; share: number; inRange: number };
  sourceRegion: Array<{ key: string; count: number }>;
  regionNames: Array<[string, string]>;
  /** One name out of three million; null only on an empty build. */
  featured: FeaturedPerson | null;
}

function chart(
  id: string,
  rows: Array<{ key: string; count: number }>,
  labels: LabelMap,
  options: { dropUnknown?: boolean; mergeUnknown?: boolean } = {},
): ChartData {
  const { slices, caveat } = slicesFor(dimensionById(id)!, rows, labels, options);
  return { slices, caveat };
}

/** One hour, same as the ISR revalidation window this memo replaces (see `loadHomeData`). */
const HOME_MEMO_TTL_MS = 60 * 60 * 1000;

/** Mirrors the shape of the slot cache in `src/db/serving.ts`: a module-level value plus the time
 * it was computed, re-checked against `now()` on every call. There is one home page, so the memo
 * is keyed on nothing. */
let homeMemo: { at: number; data: HomeData } | undefined;

/**
 * Clears the memo so the next request re-fetches. The home page is `force-dynamic` and reads this
 * memo instead of Next's page cache, so `revalidatePath("/")` (the route that runs after `publish`
 * swaps in a new build) no longer touches the data this page actually serves. Call this from that
 * route or the monthly swap will keep serving the previous build's counts, data date and featured
 * person here for up to an hour — and if the featured person is absent from the new build, the
 * hero links to a 404.
 */
export function resetHomeMemo(): void {
  homeMemo = undefined;
}

/**
 * The page renders per request (`dynamic = "force-dynamic"` in `src/app/page.tsx`, spec §3.6): the
 * home page reads live aggregates, but a build-time prerender would need Postgres during `next
 * build`, which the deployment image does not have (spec §4.1 — the server never runs the ETL, and
 * the image build has no database either). Re-querying on every request would still be wasteful, so
 * this memo stands in for the revalidation window ISR used to provide.
 *
 * `serving` and `random` are injectable so tests get a deterministic, always-fresh result — passing
 * `serving` explicitly bypasses the memo entirely, which is what every test in
 * tests/integration/web-home.test.ts does. `now` is injectable so the memo's own TTL behaviour can
 * be tested without an hour-long sleep.
 */
export async function loadHomeData(
  serving?: Serving,
  random: number = Math.random(),
  now: () => number = Date.now,
): Promise<HomeData> {
  if (!serving) {
    const ts = now();
    if (homeMemo && ts - homeMemo.at < HOME_MEMO_TTL_MS) return homeMemo.data;
    const data = await fetchHomeData(await getActiveServing(), random);
    homeMemo = { at: ts, data };
    return data;
  }
  return fetchHomeData(serving, random);
}

async function fetchHomeData(s: Serving, random: number): Promise<HomeData> {
  const [summary, info, labels, sex, sentence, arrestYear, sourceRegion, maxId] = await Promise.all([
    getSummary(s), getBuildInfo(s), getLabels(s),
    getDimension(s, "sex"), getDimension(s, "sentence_type"), getDimension(s, "arrest_year"), getDimension(s, "source_region"),
    getMaxPersonId(s),
  ]);
  const featured = maxId === null ? null : await getFeaturedPerson(s, featuredStartId(random, maxId));
  const unknownCount = arrestYear.filter((r) => r.key === "unknown").reduce((n, r) => n + r.count, 0);
  const terror = yearShare(arrestYear, TERROR_YEARS);
  return {
    summary,
    dataDate: info?.dataDate ?? null,
    // §1 addendum: the home pie merges "не указано"/"не распознано" into one "неизвестно" slice.
    sex: chart("sex", sex, labels, { mergeUnknown: true }),
    // §4: the home bar drops both rows outright — its values are absolute counts, so the remaining
    // bars keep their meaning without them.
    sentence: chart("sentence_type", sentence, labels, { dropUnknown: true }),
    arrestsByYear: { rows: arrestYear.filter((r) => r.key !== "unknown"), unknownCount },
    terror: { from: TERROR_YEARS[0], to: TERROR_YEARS[1], share: terror.share, inRange: terror.inRange },
    sourceRegion,
    regionNames: [...(labels.get("source_region") ?? new Map())].map(([code, l]) => [code, l.labelRu]),
    featured,
  };
}
