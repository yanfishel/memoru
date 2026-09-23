import { createReadStream } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { normalizeStaging } from "../../scripts/etl/normalize/run";
import { buildServing } from "../../scripts/etl/serving/build";
import { loadLabels } from "../../scripts/etl/serving/labels";
import { getFeaturedPerson, getMaxPersonId } from "../../src/db/queries";
import { resolveServing } from "../../src/db/serving";
import { loadHomeData } from "../../src/lib/home";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
  await normalizeStaging(pool, loadAllDictionaries("data/dicts"));
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  // Schemas left behind by an earlier run would still answer `resolveServing`, so this build starts
  // from a clean lineage — the same sweep tests/integration/serving.test.ts does.
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await buildServing(pool, { buildId: "20260916_home", labels: loadLabels("data/labels.csv"), dataDate: "2026-09-16" });
});
afterAll(() => pool.end());

describe("loadHomeData", () => {
  it("assembles headline numbers, chart slices, the terror share, the map rows and a featured person", async () => {
    const data = await loadHomeData(await resolveServing(pool), 0);
    // Fixture note (tests/fixtures/mini-dump.xml): both persons carry a rehab date,
    // so rehabilitated is 2, not the brief draft's 1 (see tests/integration/serving.test.ts).
    // Of the two, only person 103 has both a first sentence of "vmn" and a recorded execution
    // (person 101 was sentenced to 10 years ITL), so executed_confirmed is 1.
    expect(data.summary).toMatchObject({ persons: 2, executed: 1, executed_confirmed: 1, rehabilitated: 2, cases: 2 });
    expect(data.dataDate).toBe("2026-09-16");
    expect(data.sex.slices.map((s) => [s.key, s.count])).toEqual([["m", 2]]);
    expect(data.arrestsByYear.rows).toEqual([{ key: "1938", count: 2 }]);
    expect(data.arrestsByYear.unknownCount).toBe(0);
    expect(data.terror).toEqual({ from: 1937, to: 1938, share: 1, inRange: 2 });
    expect(data.sourceRegion).toEqual(expect.arrayContaining([{ key: "RU-CHE", count: 1 }, { key: "RU-BA", count: 1 }]));
    expect(new Map(data.regionNames).get("RU-CHE")?.length).toBeGreaterThan(0);
    expect(data.sentence.slices.some((s) => s.key === "vmn")).toBe(true);
    expect(data.featured).not.toBeNull();
    expect(data.featured!.arrestYear).toBe(1938);
    expect(typeof data.featured!.birthYear).toBe("number");
    expect(typeof data.featured!.convictionYear).toBe("number");
    expect(typeof data.featured!.photoFile).toBe("string");
    // Fixture note: person 103 (the only fixture person the filter can pick, see below) is
    // "мужчина" — `sex` is selected now but wasn't filtered on, so this is just confirming it
    // comes through, not a new eligibility condition.
    expect(data.featured!.sex).toBe("m");
  });

  it("skips an otherwise-eligible person without a photo", async () => {
    // Fixture note (tests/fixtures/mini-dump.xml): person 101 (Сафронов) has a birth year, a dated
    // first case (arrest + conviction) and a rehabilitation year — everything but a photo — while
    // person 103 (Сверкот) has all of that plus a `фотография` param, so it's the only fixture
    // person the round-4 filter can ever pick.
    const serving = await resolveServing(pool);
    const picked = await getFeaturedPerson(serving, 101);
    expect(picked).not.toBeNull();
    expect(picked!.id).toBe(103);
    expect(picked!.photoFile).not.toBeNull();
  });

  it("skips a photo-bearing, otherwise-eligible person with no conviction year", async () => {
    // Person 103 is the fixture's only photo-bearing, fully-eligible person (see the test above);
    // with its conviction year removed, person 101 (still photo-less) can't fill in either, so no
    // fixture person satisfies the filter and the pick comes back empty. Restored in `finally` so
    // later tests in this file see the fixture as `beforeAll` built it.
    const serving = await resolveServing(pool);
    const c = serving.t.personCase;
    await serving.db.update(c).set({ convictionYear: null }).where(and(eq(c.personId, 103), eq(c.n, 1)));
    try {
      const picked = await getFeaturedPerson(serving, 103);
      expect(picked).toBeNull();
    } finally {
      await serving.db.update(c).set({ convictionYear: 1938 }).where(and(eq(c.personId, 103), eq(c.n, 1)));
    }
  });

  it("skips a photo-bearing, otherwise-eligible person with no ending (no death, no rehab)", async () => {
    // Same reasoning as the conviction-year test above, but for the "death year or rehab year"
    // half of the filter: strip both of person 103's endings and nothing in the fixture qualifies.
    const serving = await resolveServing(pool);
    const p = serving.t.person;
    const c = serving.t.personCase;
    await serving.db.update(p).set({ deathYear: null }).where(eq(p.id, 103));
    await serving.db.update(c).set({ rehabYear: null }).where(and(eq(c.personId, 103), eq(c.n, 1)));
    try {
      const picked = await getFeaturedPerson(serving, 103);
      expect(picked).toBeNull();
    } finally {
      await serving.db.update(p).set({ deathYear: 1938 }).where(eq(p.id, 103));
      await serving.db.update(c).set({ rehabYear: 1961 }).where(and(eq(c.personId, 103), eq(c.n, 1)));
    }
  });

  it("skips a case tried abroad by a Soviet occupation tribunal, and keeps one with no court at all", async () => {
    // The two unit tribunals that sat outside the USSR (48240 in Germany and the GDR, 28990 in
    // Austria) are excluded from the pool; see the note on `getFeaturedPerson`. The second half
    // guards the SQL: a NULL court must not fall out of the pool along with them.
    const serving = await resolveServing(pool);
    const c = serving.t.personCase;
    const restore = (court: string | null) =>
      serving.db.update(c).set({ courtRaw: court }).where(and(eq(c.personId, 103), eq(c.n, 1)));
    const original = (await serving.db.select({ court: c.courtRaw }).from(c).where(and(eq(c.personId, 103), eq(c.n, 1))))[0].court;
    try {
      await restore("Военным трибуналом в/ч 48240");
      expect(await getFeaturedPerson(serving, 103)).toBeNull();
      await restore("Военным трибуналом в/ч 28990");
      expect(await getFeaturedPerson(serving, 103)).toBeNull();
      await restore("Военный трибунал в/ч 16651");
      expect((await getFeaturedPerson(serving, 103))?.id).toBe(103);
      await restore(null);
      expect((await getFeaturedPerson(serving, 103))?.id).toBe(103);
    } finally {
      await restore(original);
    }
  });

  it("wraps the featured pick to the first eligible person past the end of the id range", async () => {
    // `loadHomeData` clamps its start id to max(id), which is itself eligible, so the wrap branch is
    // only reachable by asking for an id past the end directly.
    const serving = await resolveServing(pool);
    const maxId = await getMaxPersonId(serving);
    expect(maxId).not.toBeNull();
    const wrapped = await getFeaturedPerson(serving, maxId! + 1);
    expect(wrapped).not.toBeNull();
    expect(wrapped!.id).toBeLessThanOrEqual(maxId!);
  });
});
