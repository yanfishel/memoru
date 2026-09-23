/** Pure helpers for the home page (spec §3.6). No imports, so tests and the page share them cheaply. */

export const TERROR_YEARS: [number, number] = [1937, 1938];

/** The share of records with a known arrest year that fall inside `years`, from the year facet rows. */
export function yearShare(
  rows: Array<{ key: string; count: number }>,
  years: [number, number],
): { inRange: number; known: number; share: number } {
  let inRange = 0;
  let known = 0;
  for (const row of rows) {
    if (!/^\d{4}$/.test(row.key)) continue;
    const year = Number(row.key);
    known += row.count;
    if (year >= years[0] && year <= years[1]) inRange += row.count;
  }
  return { inRange, known, share: known === 0 ? 0 : inRange / known };
}

/** The home page's arrests chart drops trailing years below this share of the peak year's count
 * (spec: home chart only — the "Цифры" page keeps the full range). */
export const ARRESTS_TAIL_THRESHOLD = 0.001;

/**
 * Trims the trailing years of `range` whose count falls below `threshold` × the range's peak year
 * count. Only the tail is cut — the start of `range` and any dip in the middle are left alone, and the
 * peak year itself is always kept, so the result is never empty or inverted even if `threshold` would
 * otherwise swallow the whole range.
 */
export function trimmedYearRange(
  rows: Array<{ key: string; count: number }>,
  range: [number, number],
  threshold: number,
): [number, number] {
  const byYear = new Map<number, number>();
  for (const row of rows) {
    if (!/^\d{4}$/.test(row.key)) continue;
    const year = Number(row.key);
    if (year < range[0] || year > range[1]) continue;
    byYear.set(year, (byYear.get(year) ?? 0) + row.count);
  }
  let peakYear = range[0];
  let peakCount = 0;
  for (const [year, count] of byYear) {
    if (count > peakCount) {
      peakCount = count;
      peakYear = year;
    }
  }
  const cutoff = peakCount * threshold;
  let to = range[1];
  while (to > peakYear && (byYear.get(to) ?? 0) < cutoff) to--;
  return [range[0], to];
}

/** A random starting id in [1, maxId] for the featured-person pick; `random` is in [0, 1). */
export function featuredStartId(random: number, maxId: number): number {
  if (maxId < 1) return 1;
  const clamped = Math.min(Math.max(random, 0), 1);
  return Math.min(maxId, 1 + Math.floor(clamped * maxId));
}

/** `summary.executed_confirmed` (first sentence VMN and a recorded execution), or null when the
 * active serving schema predates that aggregate key (scripts/etl/db/serving.sql) — the page then
 * omits the sentence instead of printing a false zero or crashing, which also keeps a rollback to
 * an older build safe (spec §4.1: the server only restores a finished database, never runs ETL). */
export function executedConfirmedCount(summary: Record<string, number>): number | null {
  const n = summary.executed_confirmed;
  return typeof n === "number" ? n : null;
}

/** Unknown sex takes the masculine forms (spec's standing decision) — the same rule
 * `genderOf` applies in person-view.ts, restated here as a one-liner rather than exporting
 * that module-private helper (person-view.ts takes a full `PersonRecord`; the featured card
 * only ever has `FeaturedPerson`'s bare `sex` string, so there is nothing to share but the rule). */
export function isFeminine(sex: string): boolean {
  return sex === "f";
}
