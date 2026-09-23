import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool } from "../../../scripts/etl/db/pool";

describe("createPool", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("attaches a single error listener that does not throw when the pool emits an error", async () => {
    const pool = createPool("postgres://u:p@localhost:5432/db");

    expect(pool.listenerCount("error")).toBe(1);
    expect(() => pool.emit("error", new Error("boom"), {} as never)).not.toThrow();

    await pool.end();
  });
});
