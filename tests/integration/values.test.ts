import { createReadStream } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../scripts/etl/db/pool";
import { readDumpPages } from "../../scripts/etl/dump/read-dump";
import { importDump } from "../../scripts/etl/import";
import { loadAllDictionaries } from "../../scripts/etl/normalize/dicts";
import { listValues } from "../../scripts/etl/values";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
const pool = createPool(url);
const dicts = loadAllDictionaries("data/dicts");

beforeAll(async () => {
  await importDump(pool, readDumpPages(createReadStream("tests/fixtures/mini-dump.xml")));
});
afterAll(() => pool.end());

describe("listValues", () => {
  it("counts a plain parameter and maps codes", async () => {
    expect(await listValues(pool, "пол", { dict: dicts.sex })).toEqual([{ rawValue: "мужчина", count: 2, code: "m" }]);
  });

  it("includes numbered variants of a case parameter", async () => {
    const rows = await listValues(pool, "приговор");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rawValue).sort()).toEqual(["10 лет ИТЛ", "ВМН (расстрел)"]);
    expect(rows.every((r) => r.count === 1 && r.code === "")).toBe(true);
  });

  it("lists categories", async () => {
    const rows = await listValues(pool, "@category", { dict: dicts.source_region });
    expect(rows).toContainEqual({ rawValue: "Башкирия", count: 1, code: "RU-BA" });
    expect(rows).toContainEqual({ rawValue: "Все мартирологи", count: 1, code: "unrecognized" });
  });

  it("can take the first comma-separated segment", async () => {
    const rows = await listValues(pool, "место рождения", { dict: dicts.birth_region, firstSegment: true });
    expect(rows).toContainEqual({ rawValue: "ЧО", count: 1, code: "RU-CHE" });
    expect(rows).toContainEqual({ rawValue: "Польша", count: 1, code: "unrecognized" });
  });

  it("applies the limit", async () => {
    expect(await listValues(pool, "@category", { limit: 2 })).toHaveLength(2);
  });
});
