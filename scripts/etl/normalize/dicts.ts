import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { normalizeKey } from "./text";

export const UNKNOWN = "unknown";
export const UNRECOGNIZED = "unrecognized";

export type DictMethod = "rule" | "manual" | "llm";
const METHODS: readonly DictMethod[] = ["rule", "manual", "llm"];
const HEADER = ["raw_value", "code", "method", "reviewed"];

export interface DictEntry {
  rawValue: string;
  code: string;
  method: DictMethod;
  reviewed: boolean;
}

export class Dictionary {
  private readonly byKey = new Map<string, string>();

  constructor(
    readonly field: string,
    private readonly all: DictEntry[],
  ) {
    for (const entry of all) {
      const key = normalizeKey(entry.rawValue);
      const existing = this.byKey.get(key);
      if (existing !== undefined && existing !== entry.code) {
        throw new Error(`${field}: conflicting codes for "${key}": ${existing}, ${entry.code}`);
      }
      this.byKey.set(key, entry.code);
    }
  }

  get size(): number {
    return this.byKey.size;
  }

  has(raw: string): boolean {
    return this.byKey.has(normalizeKey(raw));
  }

  lookup(raw: string | undefined): string {
    if (raw === undefined) return UNKNOWN;
    const key = normalizeKey(raw);
    if (key === "") return UNKNOWN;
    return this.byKey.get(key) ?? UNRECOGNIZED;
  }

  entries(): DictEntry[] {
    return [...this.all];
  }
}

export function parseDictionaryCsv(field: string, csv: string): Dictionary {
  const records = parse(csv, { skip_empty_lines: true, bom: true, relax_column_count: true }) as string[][];
  const [header, ...rows] = records;
  if (!header || header.join(",") !== HEADER.join(",")) {
    throw new Error(`${field}: expected header ${HEADER.join(",")}`);
  }
  const entries = rows.map((row, i): DictEntry => {
    if (row.length !== header.length) {
      throw new Error(`${field}: row ${i + 1} has ${row.length} columns, expected ${header.length}`);
    }
    const [rawValue, code, method, reviewed] = row;
    if (!METHODS.includes(method as DictMethod)) {
      throw new Error(`${field}: unknown method "${method}"`);
    }
    return { rawValue, code, method: method as DictMethod, reviewed: reviewed === "true" };
  });
  return new Dictionary(field, entries);
}

export function loadDictionary(dir: string, field: string): Dictionary {
  const file = join(dir, `${field}.csv`);
  if (!existsSync(file)) return new Dictionary(field, []);
  return parseDictionaryCsv(field, readFileSync(file, "utf8"));
}

export const DICT_FIELDS = [
  "sex",
  "nationality",
  "education",
  "party",
  "sentence_type",
  "birth_country",
  "birth_region",
  "residence_region",
  "source_region",
] as const;

export type DictField = (typeof DICT_FIELDS)[number];
export type Dictionaries = Record<DictField, Dictionary>;

export function loadAllDictionaries(dir: string): Dictionaries {
  return Object.fromEntries(DICT_FIELDS.map((field) => [field, loadDictionary(dir, field)])) as Dictionaries;
}
