import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

export const COVERAGE_FIELDS = [
  "sex", "birth_year", "arrest_year", "age_at_arrest", "death_year", "nationality",
  "education", "party", "sentence_type", "birth_region", "birth_country", "residence_region", "source_region",
] as const;

export type CoverageField = (typeof COVERAGE_FIELDS)[number];

export interface FieldCoverage {
  known: number;
  share: number;
}

export interface CoverageReport {
  generatedAt: string;
  persons: number;
  cases: number;
  pages: number;
  errors: number;
  fields: Record<CoverageField, FieldCoverage>;
}

const CODE_KNOWN = (column: string) => `count(*) FILTER (WHERE ${column} NOT IN ('unknown', 'unrecognized'))::int`;
const NOT_NULL = (column: string) => `count(${column})::int`;

const FIELD_SQL: Record<CoverageField, string> = {
  sex: CODE_KNOWN("sex"),
  birth_year: NOT_NULL("birth_year"),
  arrest_year: NOT_NULL("first_arrest_year"),
  age_at_arrest: NOT_NULL("age_at_arrest"),
  death_year: NOT_NULL("death_year"),
  nationality: CODE_KNOWN("nationality_code"),
  education: CODE_KNOWN("education_code"),
  party: CODE_KNOWN("party_code"),
  sentence_type: CODE_KNOWN("first_sentence_type"),
  birth_region: CODE_KNOWN("birth_region_code"),
  birth_country: CODE_KNOWN("birth_country_code"),
  residence_region: CODE_KNOWN("residence_region_code"),
  source_region: CODE_KNOWN("source_region_code"),
};

/** Fields whose coverage must not drop more than MAX_DROP between committed reports (spec §5.5). */
const KEY_FIELDS: CoverageField[] = ["sex", "birth_year", "arrest_year"];
const MAX_DROP = 0.05;
const MIN_PERSON_SHARE = 0.95;
const MAX_ERROR_SHARE = 0.01;

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export async function computeCoverage(pool: pg.Pool, generatedAt: string): Promise<CoverageReport> {
  const selects = COVERAGE_FIELDS.map((f) => `${FIELD_SQL[f]} AS ${f}`).join(",\n       ");
  const { rows } = await pool.query(`SELECT count(*)::int AS persons,\n       ${selects}\n  FROM staging.person`);
  const counts = rows[0] as Record<string, number>;
  const persons = counts.persons;

  const cases = (await pool.query(`SELECT count(*)::int AS n FROM staging.person_case`)).rows[0].n as number;

  const metaRows = (
    await pool.query(`SELECT key, value FROM staging.import_meta WHERE key IN ('import', 'normalize')`)
  ).rows as { key: string; value: Record<string, unknown> }[];
  const importMeta = metaRows.find((r) => r.key === "import")?.value as
    | { imported: number; errors: number; rawBlocks?: number }
    | undefined;
  const normalizeMeta = metaRows.find((r) => r.key === "normalize")?.value as { errors: number } | undefined;

  // staging.etl_errors truncates at MAX_RECORDED_ERRORS (import.ts), so a systemic
  // failure rate could otherwise hide below the 1%-of-pages publish gate behind a
  // truncated count. import_meta's 'import' and 'normalize' rows each carry the
  // accurate, uncapped `errors` count, so sum those instead; fall back to the
  // (possibly truncated) etl_errors row count only when a meta row is missing.
  const errors =
    importMeta && normalizeMeta
      ? importMeta.errors + normalizeMeta.errors
      : ((await pool.query(`SELECT count(*)::int AS n FROM staging.etl_errors`)).rows[0].n as number);

  // `pages` must stay in the same unit as `errors` above (raw <page> blocks,
  // not distinct pages) or the 1%-of-pages gate compares mismatched units.
  // import_meta.import.rawBlocks carries that block count since the page-id
  // dedup was added (task 7c); a meta row written before that change only has
  // `imported`, which was itself block-level back then, so it's a safe fallback.
  const pages = importMeta
    ? (importMeta.rawBlocks ?? importMeta.imported) + errors
    : persons;

  const fields = Object.fromEntries(
    COVERAGE_FIELDS.map((f) => [f, { known: counts[f], share: persons === 0 ? 0 : round4(counts[f] / persons) }]),
  ) as Record<CoverageField, FieldCoverage>;

  return { generatedAt, persons, cases, pages, errors, fields };
}

export function evaluateChecks(input: {
  report: CoverageReport;
  previous: CoverageReport | null;
  censusFormularPages: number;
}): string[] {
  const { report, previous, censusFormularPages } = input;
  const failures: string[] = [];

  if (report.persons < MIN_PERSON_SHARE * censusFormularPages) {
    failures.push(`persons ${report.persons} < 95% of census Формуляр pages (${censusFormularPages})`);
  }
  if (previous) {
    for (const field of KEY_FIELDS) {
      const before = previous.fields[field].share;
      const after = report.fields[field].share;
      if (round4(before - after) > MAX_DROP) {
        failures.push(`${field} coverage dropped from ${pct(before)} to ${pct(after)}`);
      }
    }
  }
  if (report.errors > MAX_ERROR_SHARE * report.pages) {
    failures.push(`errors ${report.errors} > 1% of pages (${report.pages})`);
  }
  return failures;
}

/** The report with its file name, for callers that have to say which report they read. */
export function findLatestReportFile(dir: string): { file: string; report: CoverageReport } | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^coverage-.*\.json$/.test(f)).sort();
  if (files.length === 0) return null;
  const file = files[files.length - 1];
  return { file, report: JSON.parse(readFileSync(join(dir, file), "utf8")) as CoverageReport };
}

export function findLatestReport(dir: string): CoverageReport | null {
  return findLatestReportFile(dir)?.report ?? null;
}
