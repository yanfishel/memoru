import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MeilisearchTaskTimeOutError } from "meilisearch";
import { readDocumentsJsonl, waitOk, writeDocumentsJsonl } from "../../../../scripts/etl/search/documents-io";
import type { PersonDocument } from "../../../../scripts/etl/search/documents";

const dir = mkdtempSync(join(tmpdir(), "memoru-docs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function doc(id: number): PersonDocument {
  return {
    id, surname: `Фамилия${id}`, given_name: "Имя", patronymic: null, name: `Фамилия${id} Имя`, name_folded: `Фамилия${id} Имя`,
    title_year: 1900, birth_year: 1900, death_year: null, arrest_year: 1937, age_at_arrest_bucket: "35-44", age_at_death_bucket: "unknown",
    sex: "m", nationality_code: "russian", education_code: "unknown", party_code: "unknown", sentence_type: "itl",
    birth_region_code: "RU-CHE", residence_region_code: "unknown", source_region_code: "RU-CHE", birth_country_code: "RU",
    death_kind: "unknown", rehabilitated: false, has_photo: false,
  };
}

async function* batches(sizes: number[]): AsyncGenerator<PersonDocument[]> {
  let next = 1;
  for (const size of sizes) {
    const out: PersonDocument[] = [];
    for (let i = 0; i < size; i++) out.push(doc(next++));
    yield out;
  }
}

describe("documents JSONL round trip", () => {
  it("writes gzipped lines and reads them back in batches", async () => {
    const file = join(dir, "people.jsonl.gz");
    const written = await writeDocumentsJsonl(batches([3, 2]), file);
    expect(written).toEqual({ documents: 5 });

    const read: PersonDocument[][] = [];
    for await (const batch of readDocumentsJsonl(file, 2)) read.push(batch);
    expect(read.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(read.flat()).toEqual([doc(1), doc(2), doc(3), doc(4), doc(5)]);
  });

  it("handles an empty export", async () => {
    const file = join(dir, "empty.jsonl.gz");
    expect(await writeDocumentsJsonl(batches([]), file)).toEqual({ documents: 0 });
    const read: PersonDocument[][] = [];
    for await (const batch of readDocumentsJsonl(file, 10)) read.push(batch);
    expect(read).toEqual([]);
  });
});

describe("waitOk", () => {
  it("resolves silently when the task succeeded", async () => {
    await expect(waitOk(Promise.resolve({ status: "succeeded" }), "update settings")).resolves.toBeUndefined();
  });

  it("reports a non-timeout failure with the task's own status and error, unchanged", async () => {
    await expect(
      waitOk(Promise.resolve({ status: "failed", error: { message: "index is full" } }), "update settings"),
    ).rejects.toThrow(/Meilisearch update settings failed: \{"message":"index is full"\}/);
  });

  it("turns a Meilisearch task timeout into a message naming the operation, task uid and timeout, and what to do next", async () => {
    const timeoutError = new MeilisearchTaskTimeOutError(42, 7_200_000);
    let thrown: unknown;
    try {
      await waitOk(Promise.reject(timeoutError), "update settings");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/Meilisearch update settings did not finish within 7200000ms \(task 42\)\./);
    expect(message).toMatch(/may still be working/);
    expect(message).toMatch(/GET \/tasks\/42/);
    expect(message).toMatch(/MEILI_TASK_TIMEOUT_MS/);
    expect((thrown as Error).cause).toBe(timeoutError);
  });

  it("leaves non-timeout errors from the wait itself untouched", async () => {
    await expect(waitOk(Promise.reject(new Error("network down")), "create index")).rejects.toThrow("network down");
  });
});
