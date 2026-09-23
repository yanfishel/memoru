import { stringify } from "csv-stringify/sync";
import type pg from "pg";
import type { Dictionary } from "./normalize/dicts";

export interface ValueRow {
  rawValue: string;
  count: number;
  code: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listValues(
  pool: pg.Pool,
  param: string,
  options: { dict?: Dictionary; firstSegment?: boolean; limit?: number } = {},
): Promise<ValueRow[]> {
  const limit = options.limit ?? 500;
  const valueExpr = options.firstSegment ? "btrim(split_part(v.value, ',', 1))" : "v.value";
  const source =
    param === "@category"
      ? "SELECT unnest(categories) AS value FROM staging.person_raw"
      : `SELECT kv.value FROM staging.person_raw r, jsonb_each_text(r.params) kv
          WHERE kv.key = $2 OR kv.key ~ $3`;
  const params = param === "@category" ? [limit] : [limit, param, `^${escapeRegex(param)} [0-9]+$`];

  const { rows } = await pool.query<{ raw_value: string; count: number }>(
    `SELECT ${valueExpr} AS raw_value, count(*)::int AS count
       FROM (${source}) v
      GROUP BY 1
      ORDER BY count DESC, raw_value
      LIMIT $1`,
    params,
  );
  return rows.map((r) => ({
    rawValue: r.raw_value,
    count: r.count,
    code: options.dict ? options.dict.lookup(r.raw_value) : "",
  }));
}

export function renderValuesCsv(rows: ValueRow[]): string {
  return stringify(
    rows.map((r) => [r.rawValue, r.count, r.code]),
    { header: true, columns: ["raw_value", "count", "code"] },
  );
}
