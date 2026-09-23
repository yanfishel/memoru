import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);

afterAll(() => pool.end());

describe("database", () => {
  it("answers a query", async () => {
    const { rows } = await pool.query("SELECT 1 AS one");
    expect(rows[0].one).toBe(1);
  });
});
