import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { servingTables, type ServingTables } from "./schema";

export interface Serving {
  schema: string;
  searchIndex: string | null;
  db: NodePgDatabase;
  t: ServingTables;
}

const tablesByName = new Map<string, ServingTables>();

function tablesFor(schema: string): ServingTables {
  let tables = tablesByName.get(schema);
  if (!tables) {
    tables = servingTables(schema);
    tablesByName.set(schema, tables);
  }
  return tables;
}

/** Reads public.serving_slot and returns Drizzle bound to the active schema. */
export async function resolveServing(pool: pg.Pool): Promise<Serving> {
  const { rows } = await pool.query(`SELECT active_schema, search_index FROM public.serving_slot WHERE id = 1`);
  const row = rows[0] as { active_schema: string; search_index: string | null } | undefined;
  if (!row) throw new Error("public.serving_slot is empty: no serving data has been published");
  return { schema: row.active_schema, searchIndex: row.search_index, db: drizzle(pool), t: tablesFor(row.active_schema) };
}

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString: url, max: 10 });
    pool.on("error", (err) => console.error("pg pool error:", err));
  }
  return pool;
}

let cached: { at: number; serving: Serving } | undefined;

/** The web app's entry point: the active serving schema, re-read at most every maxAgeMs
 * so a publish (an UPDATE of serving_slot) is visible between one request and the next. */
export async function getActiveServing(options: { maxAgeMs?: number } = {}): Promise<Serving> {
  const maxAge = options.maxAgeMs ?? 5000;
  const now = Date.now();
  if (cached && now - cached.at < maxAge) return cached.serving;
  const serving = await resolveServing(getPool());
  cached = { at: now, serving };
  return serving;
}
