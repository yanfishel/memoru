import { describe, expect, it } from "vitest";
import { runPgTool, toolPath } from "../../../../scripts/etl/artifacts/pg-tools";

describe("toolPath", () => {
  it("joins the tools' view of the artifacts directory with the build and the file", () => {
    expect(toolPath("/artifacts", "20260916", "serving_20260916.dump")).toBe("/artifacts/20260916/serving_20260916.dump");
    expect(toolPath("/artifacts/", "20260916", "x.gz")).toBe("/artifacts/20260916/x.gz");
  });
});

describe("runPgTool", () => {
  it("redacts the spawn error: the raw one carries the connection URL in spawnargs", async () => {
    const config = { pgTools: ["memoru-no-such-command"] };
    const error = await runPgTool(config, "pg_dump", ["--dbname=postgres://user:hunter2@localhost/db"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("pg_dump could not start: ENOENT");
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain("hunter2");
  });
});
