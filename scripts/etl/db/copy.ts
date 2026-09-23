import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

export type CopyValue = string | number | boolean | null | undefined | string[] | Record<string, unknown>;

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function arrayLiteral(items: string[]): string {
  return `{${items.map((item) => `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export function encodeCopyValue(value: CopyValue): string {
  if (value === null || value === undefined) return "\\N";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return escapeText(value);
  if (Array.isArray(value)) return escapeText(arrayLiteral(value));
  return escapeText(JSON.stringify(value));
}

export function encodeCopyRow(values: CopyValue[]): string {
  return values.map(encodeCopyValue).join("\t") + "\n";
}

const BATCH_ROWS = 1000;

export async function copyRows(
  client: pg.PoolClient,
  sql: string,
  rows: AsyncIterable<CopyValue[]> | Iterable<CopyValue[]>,
): Promise<number> {
  let count = 0;
  async function* chunks(): AsyncGenerator<string> {
    let batch: string[] = [];
    for await (const row of rows) {
      batch.push(encodeCopyRow(row));
      count++;
      if (batch.length >= BATCH_ROWS) {
        yield batch.join("");
        batch = [];
      }
    }
    if (batch.length > 0) yield batch.join("");
  }
  await pipeline(Readable.from(chunks()), client.query(copyFrom(sql)));
  return count;
}

export async function runSqlFile(client: pg.PoolClient, relativePath: string): Promise<void> {
  await client.query(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
}
