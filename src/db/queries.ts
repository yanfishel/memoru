import "server-only";

import { and, asc, desc, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import type { CaseRecord, PersonRecord } from "./schema";
import type { Serving } from "./serving";

export async function getSummary(s: Serving): Promise<Record<string, number>> {
  const rows = await s.db.select().from(s.t.aggSummary);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getDimension(s: Serving, dimension: string): Promise<Array<{ key: string; count: number }>> {
  return s.db
    .select({ key: s.t.aggDimension.key, count: s.t.aggDimension.count })
    .from(s.t.aggDimension)
    .where(eq(s.t.aggDimension.dimension, dimension))
    .orderBy(desc(s.t.aggDimension.count), asc(s.t.aggDimension.key));
}

export type LabelMap = Map<string, Map<string, { labelRu: string; sortOrder: number }>>;

export async function getLabels(s: Serving): Promise<LabelMap> {
  const rows = await s.db.select().from(s.t.codeLabel);
  const out: LabelMap = new Map();
  for (const row of rows) {
    let byCode = out.get(row.field);
    if (!byCode) {
      byCode = new Map();
      out.set(row.field, byCode);
    }
    byCode.set(row.code, { labelRu: row.labelRu, sortOrder: row.sortOrder });
  }
  return out;
}

export async function getPerson(s: Serving, id: number): Promise<PersonRecord | null> {
  const rows = await s.db.select().from(s.t.person).where(eq(s.t.person.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getCases(s: Serving, id: number): Promise<CaseRecord[]> {
  return s.db.select().from(s.t.personCase).where(eq(s.t.personCase.personId, id)).orderBy(asc(s.t.personCase.n));
}

export interface BuildInfo {
  buildId: string;
  dataDate: string | null;
  persons: number;
  cases: number;
}

export async function getBuildInfo(s: Serving): Promise<BuildInfo | null> {
  const rows = await s.db.select().from(s.t.buildInfo).where(eq(s.t.buildInfo.key, "build")).limit(1);
  const value = rows[0]?.value as (BuildInfo & { schema: string; builtAt: string }) | undefined;
  if (!value) return null;
  return { buildId: value.buildId, dataDate: value.dataDate, persons: value.persons, cases: value.cases };
}

export async function getMaxPersonId(s: Serving): Promise<number | null> {
  const rows = await s.db.select({ max: sql<number | string | null>`max(${s.t.person.id})` }).from(s.t.person);
  const max = rows[0]?.max;
  return max === null || max === undefined ? null : Number(max);
}

export interface PersonName {
  id: number;
  surname: string;
  givenName: string | null;
  patronymic: string | null;
}

/** Names in an id range, in id order: one primary-key range scan per sitemap chunk. */
export async function listPersonNames(s: Serving, range: { from: number; to: number }): Promise<PersonName[]> {
  const p = s.t.person;
  return s.db
    .select({ id: p.id, surname: p.surname, givenName: p.givenName, patronymic: p.patronymic })
    .from(p)
    .where(and(gte(p.id, range.from), lte(p.id, range.to)))
    .orderBy(asc(p.id));
}

export interface FeaturedPerson {
  id: number;
  surname: string;
  givenName: string | null;
  patronymic: string | null;
  sex: string;
  birthYear: number;
  birthPlaceRaw: string | null;
  deathYear: number | null;
  rehabilitated: boolean;
  rehabYear: number | null;
  arrestYear: number;
  arrestMonth: number | null;
  arrestDay: number | null;
  arrestDatePrecision: string | null;
  convictionYear: number;
  photoFile: string;
}

/**
 * The home page's "one name": the first person at or after `fromId` with a photo, a birth year,
 * and a dated first case that carries both an arrest year and a conviction year plus a known
 * ending (a death year or a rehabilitation year) — everything the card's four timeline steps
 * (born/arrest/verdict/ending) need — wrapping to the start of the table. One index range scan
 * either way.
 * Measured on the live serving schema: 30,287 of 3,303,778 persons satisfy the full filter (versus
 * 37,450 under the round-3, photo-only filter), still spread across the whole id range, so the
 * random pick stays random; see the EXPLAIN ANALYZE numbers in the round-4 report for the resulting
 * timings at a few `fromId` values — still no new index needed. As before, this timing is a
 * property of today's data, not a guarantee of the query: the scan distance to the next match
 * depends entirely on how these five conditions are jointly distributed over the id range, and a
 * future rebuild that clusters them (rather than spreading them out as they are now) is the thing
 * to watch, not this query's shape.
 *
 * Cases tried abroad are left out (2026-09-18, maintainer decision): see `OCCUPATION_TRIBUNALS`.
 * That drops 533 of the 30,287, measured on serving_20260915.
 */
/**
 * The two Soviet military tribunals that sat outside the USSR: unit 48240 in occupied Germany and the
 * GDR, unit 28990 in occupied Austria. Their defendants lived in Rathenow, West Berlin or Vienna and
 * reached the USSR only as prisoners, so the repression was Soviet but the case was not one of the
 * USSR's own — which is what this site is about. 696 people carry them (serving_20260915, 2026-09-18),
 * 1 record in 4,750; in the featured pool they are 1 in 57, because the Donskoy crematorium lists that
 * hold them also hold a photo and every date the card needs.
 *
 * The other unit tribunals in the data (35289, 31123-Б, 16651, 1154, 1080, 31121, 4908) are ordinary
 * Soviet units — not one of their defendants lived abroad — so the filter is these two numbers, never
 * the "в/ч" prefix. It reads the raw court text, which is where the source states it and which spells
 * the same tribunal both "Военным трибуналом" and "Военный трибунал"; a NULL court is not a match.
 */
const OCCUPATION_TRIBUNALS = "в/ч 48240|в/ч 28990";

export async function getFeaturedPerson(s: Serving, fromId: number): Promise<FeaturedPerson | null> {
  const p = s.t.person;
  const c = s.t.personCase;
  const pick = (from: number) =>
    s.db
      .select({
        id: p.id, surname: p.surname, givenName: p.givenName, patronymic: p.patronymic, sex: p.sex,
        birthYear: p.birthYear, birthPlaceRaw: p.birthPlaceRaw, deathYear: p.deathYear, rehabilitated: p.rehabilitated,
        rehabYear: c.rehabYear, arrestYear: c.arrestYear, arrestMonth: c.arrestMonth, arrestDay: c.arrestDay,
        arrestDatePrecision: c.arrestDatePrecision, convictionYear: c.convictionYear, photoFile: p.photoFile,
      })
      .from(p)
      .innerJoin(c, and(eq(c.personId, p.id), eq(c.n, 1)))
      .where(and(
        gte(p.id, from),
        isNotNull(p.birthYear),
        isNotNull(c.arrestYear),
        isNotNull(c.convictionYear),
        isNotNull(p.photoFile),
        or(isNotNull(p.deathYear), isNotNull(c.rehabYear)),
        sql`coalesce(${c.courtRaw}, '') !~ ${OCCUPATION_TRIBUNALS}`,
      ))
      .orderBy(asc(p.id))
      .limit(1);
  const row = (await pick(fromId))[0] ?? (fromId > 1 ? (await pick(1))[0] : undefined);
  // The WHERE guarantees all of this, but the row type cannot know it.
  if (!row || row.birthYear === null || row.arrestYear === null || row.convictionYear === null || row.photoFile === null) return null;
  if (row.deathYear === null && row.rehabYear === null) return null;
  return { ...row, birthYear: row.birthYear, arrestYear: row.arrestYear, convictionYear: row.convictionYear, photoFile: row.photoFile };
}
