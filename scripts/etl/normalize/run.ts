import type pg from "pg";
import { copyRows, runSqlFile, type CopyValue } from "../db/copy";
import { MAX_RECORDED_ERRORS } from "../import";
import type { Dictionaries } from "./dicts";
import { normalizePerson, type CaseRow, type PersonRow, type RawPerson } from "./person";

export const PERSON_KEYS: (keyof PersonRow)[] = [
  "id", "surname", "givenName", "patronymic", "titleYear", "sex",
  "birthYear", "birthMonth", "birthDay", "birthDatePrecision", "birthPlaceRaw",
  "birthCountryCode", "birthRegionCode", "sourceRegionCode",
  "residenceRaw", "residenceRegionCode",
  "nationalityRaw", "nationalityCode", "educationRaw", "educationCode", "partyRaw", "partyCode",
  "deathKind", "deathYear", "deathMonth", "deathDay", "deathDatePrecision", "ageAtDeath",
  "caseCount", "firstArrestYear", "ageAtArrest", "firstSentenceType", "sourceRaw",
  "photoFile", "photoCaptionRaw", "openlistTitle",
];

export const CASE_KEYS: (keyof CaseRow)[] = [
  "personId", "n",
  "arrestYear", "arrestMonth", "arrestDay", "arrestDatePrecision",
  "convictionYear", "convictionMonth", "convictionDay", "convictionDatePrecision",
  "courtRaw", "articleRaw", "sentenceRaw", "sentenceType", "sentenceYears", "sentenceMonths",
  "rehabYear", "rehabMonth", "rehabDay", "rehabDatePrecision", "rehabBodyRaw",
];

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export interface NormalizeStats {
  persons: number;
  cases: number;
  errors: number;
}

export interface NormalizeOptions {
  batchSize?: number;
  normalize?: typeof normalizePerson;
  onProgress?: (persons: number) => void;
}

const PERSON_COPY = `COPY staging.person (${PERSON_KEYS.map(toSnake).join(", ")}) FROM STDIN`;
const CASE_COPY = `COPY staging.person_case (${CASE_KEYS.map(toSnake).join(", ")}) FROM STDIN`;

export async function normalizeStaging(
  pool: pg.Pool,
  dicts: Dictionaries,
  options: NormalizeOptions = {},
): Promise<NormalizeStats> {
  const batchSize = options.batchSize ?? 10_000;
  const normalize = options.normalize ?? normalizePerson;
  const stats: NormalizeStats = { persons: 0, cases: 0, errors: 0 };
  const errors: CopyValue[][] = [];

  const client = await pool.connect();
  try {
    await runSqlFile(client, "scripts/etl/db/staging-normalized.sql");

    let lastId = -1;
    for (;;) {
      const { rows } = await client.query<{ page_id: number; title: string; params: Record<string, string>; categories: string[] }>(
        `SELECT page_id, title, params, categories FROM staging.person_raw
          WHERE page_id > $1 ORDER BY page_id LIMIT $2`,
        [lastId, batchSize],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].page_id;

      const personRows: CopyValue[][] = [];
      const caseRows: CopyValue[][] = [];
      for (const row of rows) {
        const raw: RawPerson = { pageId: row.page_id, title: row.title, params: row.params, categories: row.categories };
        try {
          const { person, cases } = normalize(raw, dicts);
          personRows.push(PERSON_KEYS.map((k) => person[k]));
          for (const c of cases) caseRows.push(CASE_KEYS.map((k) => c[k]));
        } catch (err) {
          stats.errors++;
          // Bounds the in-memory error buffer, matching import.ts: a systemic
          // normalize bug must not grow `errors` without limit and OOM the process.
          if (errors.length < MAX_RECORDED_ERRORS) {
            errors.push([row.page_id, "normalize", String(err)]);
          }
        }
      }
      stats.persons += await copyRows(client, PERSON_COPY, personRows);
      stats.cases += await copyRows(client, CASE_COPY, caseRows);
      options.onProgress?.(stats.persons);
    }

    await copyRows(client, "COPY staging.etl_errors (page_id, stage, reason) FROM STDIN", errors);
    await client.query("ALTER TABLE staging.person ADD PRIMARY KEY (id)");
    await client.query("ALTER TABLE staging.person_case ADD PRIMARY KEY (person_id, n)");
    await client.query("ANALYZE staging.person; ANALYZE staging.person_case");
    await client.query(
      `INSERT INTO staging.import_meta (key, value) VALUES ('normalize', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ ...stats, errorsRecorded: errors.length, finishedAt: new Date().toISOString() })],
    );
  } finally {
    client.release();
  }
  return stats;
}
