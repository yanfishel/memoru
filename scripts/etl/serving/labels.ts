import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { DICT_FIELDS, UNKNOWN, UNRECOGNIZED, type Dictionaries } from "../normalize/dicts";

export interface CodeLabel {
  field: string;
  code: string;
  labelRu: string;
  sortOrder: number;
}

export interface ExpectedCode {
  field: string;
  code: string;
  suggestion: string;
}

const HEADER = ["field", "code", "label_ru", "sort_order"];

export const AGE_BUCKETS = ["<18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", UNKNOWN] as const;

/** Codes that come from rules in code rather than from a dictionary. */
const FIXED_CODES: Record<string, readonly string[]> = {
  sex: ["m", "f"],
  sentence_type: ["vmn", "itl", "vys", "zak", "pr", "other"],
  death_kind: ["executed", "died", UNKNOWN],
  age_bucket: AGE_BUCKETS,
  rehabilitated: ["true", "false"],
};

/**
 * agg_dimension dimension -> the code_label field that labels its keys. Year dimensions
 * (birth_year, arrest_year, death_year) carry no labels and are absent on purpose.
 * Plan 2c's dimension registry must use the same mapping, so that every facet the site
 * offers is labelled by the same rule the build checks.
 */
export const DIMENSION_LABEL_FIELD: Record<string, string> = {
  sex: "sex",
  nationality: "nationality",
  education: "education",
  party: "party",
  sentence_type: "sentence_type",
  death_kind: "death_kind",
  birth_country: "birth_country",
  birth_region: "birth_region",
  residence_region: "residence_region",
  source_region: "source_region",
  age_at_arrest_bucket: "age_bucket",
  age_at_death_bucket: "age_bucket",
  rehabilitated: "rehabilitated",
};

/** Label fields that carry the unknown/unrecognized pair. */
const CODED_FIELDS = [...DICT_FIELDS, "death_kind"] as const;

const SUGGESTION: Record<string, string> = {
  [UNKNOWN]: "не указано",
  [UNRECOGNIZED]: "не распознано",
};

export function parseLabelsCsv(csv: string): CodeLabel[] {
  const records = parse(csv, { skip_empty_lines: true, bom: true, relax_column_count: true }) as string[][];
  const [header, ...rows] = records;
  if (!header || header.join(",") !== HEADER.join(",")) {
    throw new Error(`labels: expected header ${HEADER.join(",")}`);
  }
  const seen = new Set<string>();
  return rows.map((row, i): CodeLabel => {
    if (row.length !== HEADER.length) {
      throw new Error(`labels: row ${i + 1} has ${row.length} columns, expected ${HEADER.length}`);
    }
    const [field, code, labelRu, sortOrderText] = row;
    const key = `${field} ${code}`;
    if (seen.has(key)) throw new Error(`labels: duplicate label for ${field}/${code}`);
    seen.add(key);
    if (labelRu.trim() === "") throw new Error(`labels: empty label for ${field}/${code}`);
    const sortOrder = Number(sortOrderText);
    if (!Number.isInteger(sortOrder)) throw new Error(`labels: sort_order "${sortOrderText}" for ${field}/${code} is not an integer`);
    return { field, code, labelRu, sortOrder };
  });
}

export function loadLabels(file: string): CodeLabel[] {
  return parseLabelsCsv(readFileSync(file, "utf8"));
}

export function expectedCodes(dicts: Dictionaries): ExpectedCode[] {
  const out = new Map<string, ExpectedCode>();
  const add = (field: string, code: string, suggestion: string) => {
    const key = `${field} ${code}`;
    if (!out.has(key)) out.set(key, { field, code, suggestion });
  };

  for (const field of DICT_FIELDS) {
    // Dictionary rows are appended in frequency order, so the first raw value per code
    // is the most common spelling and makes a reasonable label suggestion.
    for (const entry of dicts[field].entries()) add(field, entry.code, entry.rawValue);
  }
  // resolveResidence (normalize/person.ts) falls back to the birth_region dictionary when
  // the residence dictionary does not recognize a place, so residence_region_code can hold
  // any birth_region code. The residence-specific suggestion above wins when both carry it.
  for (const entry of dicts.birth_region.entries()) add("residence_region", entry.code, entry.rawValue);
  // resolveBirthPlace falls back to the ISO country prefix of the birth_region code when the
  // birth_country dictionary does not recognize the place, so every region code's prefix is
  // reachable as a birth_country code. A region code that is itself a country (LV, UA) lends
  // its raw value as the suggestion, which is why those go in first -- add() keeps the first.
  const countryOf = (code: string): string | undefined => /^([A-Z]{2})(?:-|$)/.exec(code)?.[1];
  for (const entry of dicts.birth_region.entries()) {
    if (countryOf(entry.code) === entry.code) add("birth_country", entry.code, entry.rawValue);
  }
  for (const entry of dicts.birth_region.entries()) {
    const country = countryOf(entry.code);
    if (country !== undefined) add("birth_country", country, country);
  }
  for (const [field, codes] of Object.entries(FIXED_CODES)) {
    for (const code of codes) add(field, code, SUGGESTION[code] ?? code);
  }
  for (const field of CODED_FIELDS) {
    add(field, UNKNOWN, SUGGESTION[UNKNOWN]);
    add(field, UNRECOGNIZED, SUGGESTION[UNRECOGNIZED]);
  }
  return [...out.values()];
}

export function missingLabels(expected: ExpectedCode[], labels: CodeLabel[]): ExpectedCode[] {
  const have = new Set(labels.map((l) => `${l.field} ${l.code}`));
  return expected.filter((e) => !have.has(`${e.field} ${e.code}`));
}

export function renderMissingCsv(missing: ExpectedCode[]): string {
  return missing.map((m) => `${m.field},${m.code},${m.suggestion.replace(/,/g, " ")},900`).join("\n") + (missing.length ? "\n" : "");
}
