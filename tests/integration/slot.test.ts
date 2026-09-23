import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { activateBuild, ensureServingSlot, pruneBuilds, readServingSlot, swapBack } from "../../scripts/etl/serving/slot";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);

beforeAll(async () => {
  await pool.query(`DROP TABLE IF EXISTS public.serving_slot`);
  const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving\\_%'`);
  for (const row of rows) await pool.query(`DROP SCHEMA ${row.nspname} CASCADE`);
  await ensureServingSlot(pool);
});
afterAll(() => pool.end());

describe("serving slot", () => {
  it("starts empty and activates a first build", async () => {
    expect(await readServingSlot(pool)).toBeNull();
    await activateBuild(pool, { schema: "serving_20260901_slot", index: "people_20260901_slot" });
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: "serving_20260901_slot", previousSchema: null, searchIndex: "people_20260901_slot", previousIndex: null,
    });
  });

  it("moves the active pair to previous when both schema and index are given", async () => {
    await activateBuild(pool, { schema: "serving_20260902_slot", index: "people_20260902_slot" });
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: "serving_20260902_slot", previousSchema: "serving_20260901_slot",
      searchIndex: "people_20260902_slot", previousIndex: "people_20260901_slot",
    });
    await activateBuild(pool, { schema: "serving_20260902_slot" });
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260902_slot", previousSchema: "serving_20260901_slot", searchIndex: "people_20260902_slot" });
  });

  it("a schema-only activation of a new build clears the index until it is rebuilt", async () => {
    await activateBuild(pool, { schema: "serving_20260903_slot" });
    expect(await readServingSlot(pool)).toEqual({
      activeSchema: "serving_20260903_slot", previousSchema: "serving_20260902_slot",
      searchIndex: null, previousIndex: "people_20260902_slot",
    });
    await activateBuild(pool, { index: "people_20260903_slot" });
    expect(await readServingSlot(pool)).toMatchObject({ searchIndex: "people_20260903_slot", previousIndex: "people_20260902_slot" });
    // Back to the state the following tests expect.
    await activateBuild(pool, { schema: "serving_20260902_slot", index: "people_20260902_slot" });
  });

  it("swaps back and forth", async () => {
    const back = await swapBack(pool);
    expect(back).toMatchObject({ activeSchema: "serving_20260903_slot", previousSchema: "serving_20260902_slot", searchIndex: "people_20260903_slot" });
    await swapBack(pool);
    expect(await readServingSlot(pool)).toMatchObject({ activeSchema: "serving_20260902_slot", searchIndex: "people_20260902_slot" });
  });

  it("refuses to swap back without a previous build", async () => {
    await pool.query(`UPDATE public.serving_slot SET previous_schema = NULL, previous_index = NULL`);
    await expect(swapBack(pool)).rejects.toThrow(/no previous build/);
  });

  it("prunes only what the slot displaced, never unrelated schemas", async () => {
    for (const s of ["serving_20260901_slot", "serving_20260902_slot", "serving_20260903_slot", "serving_20260904_slot"]) await pool.query(`CREATE SCHEMA ${s}`);
    // The previous test nulled previous_schema, so bounce through 901 to make it
    // previous_schema again before taking the "before" snapshot: pruneBuilds only drops
    // what "before" itself referenced (active or previous), so without this the pairing
    // rule leaves nothing for it to displace.
    await activateBuild(pool, { schema: "serving_20260901_slot" });
    await activateBuild(pool, { schema: "serving_20260902_slot" });
    const before = (await readServingSlot(pool))!;
    await activateBuild(pool, { schema: "serving_20260903_slot" });
    const after = (await readServingSlot(pool))!;
    const pruned = await pruneBuilds(pool, null, before, after);
    expect(pruned).toEqual({ schemas: ["serving_20260901_slot"], indexes: [] });
    const { rows } = await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'serving\\_%' ORDER BY 1`);
    expect(rows.map((r) => r.nspname)).toEqual(["serving_20260902_slot", "serving_20260903_slot", "serving_20260904_slot"]);
  });
});
