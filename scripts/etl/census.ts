import type { DumpPage } from "./dump/read-dump";
import { MAX_CASE_NUMBER } from "./parse/cases";
import { parseFormular } from "./parse/formular";

export interface ValueCount {
  value: string;
  count: number;
}

export interface ParamStats {
  filled: number;
  distinctValues: number;
  distinctCapped: boolean;
  topValues: ValueCount[];
}

export interface CensusReport {
  dumpPath: string;
  generatedAt: string;
  namespace0Pages: number;
  formularPages: number;
  formularPageBlocks: number;
  pagesWithCases: number;
  maxCaseNumber: number;
  params: Record<string, ParamStats>;
  topCategories: ValueCount[];
}

interface ParamState {
  filled: number;
  values: Map<string, number>;
  capped: boolean;
}

const NUMBERED_KEY = /^(.+?)\s+(\d+)$/;

function topOf(values: Map<string, number>, topN: number): ValueCount[] {
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([value, count]) => ({ value, count }));
}

export class CensusAccumulator {
  private readonly maxDistinct: number;
  private namespace0Pages = 0;
  private formularPageBlocks = 0;
  private pagesWithCases = 0;
  private maxCaseNumber = 0;
  private readonly params = new Map<string, ParamState>();
  private readonly categories = new Map<string, number>();
  // The dump repeats a page id across scattered blocks (each holding a slice of its
  // revision history), so formularPages must count distinct page ids, not blocks.
  // Over the real dump this set holds ~3.35M numbers (~200-300 MB) — a deliberate
  // one-off cost for the census run, not something later stages should copy.
  private readonly formularPageIds = new Set<number>();

  constructor(options: { maxDistinctPerParam?: number } = {}) {
    this.maxDistinct = options.maxDistinctPerParam ?? 50_000;
  }

  add(page: DumpPage): void {
    this.namespace0Pages++;
    const formular = parseFormular(page.text);
    if (!formular) return;
    this.formularPageBlocks++;
    // The dump repeats a page id across scattered blocks, and the first block
    // encountered for a page carries its highest revId (measured 2026-09-16, see
    // import.ts/fixtures.ts). Count params/categories once per distinct page, from
    // that first (most complete) block only, so `filled` stays bounded by
    // `formularPages` instead of summing every historical revision's fill state.
    const firstBlockForPage = !this.formularPageIds.has(page.pageId);
    this.formularPageIds.add(page.pageId);
    if (!firstBlockForPage) return;

    let hasCases = false;
    for (const [key, value] of Object.entries(formular.params)) {
      const numbered = NUMBERED_KEY.exec(key);
      if (numbered) {
        hasCases = true;
        const n = Number(numbered[2]);
        // Same guard as splitCases: a number this large is a year embedded in the
        // key (e.g. "место проживания до 1930"), not a case index.
        if (n <= MAX_CASE_NUMBER) this.maxCaseNumber = Math.max(this.maxCaseNumber, n);
      }
      this.countParam(numbered ? `${numbered[1]} N` : key, value);
    }
    if (hasCases) this.pagesWithCases++;

    for (const category of formular.categories) {
      this.categories.set(category, (this.categories.get(category) ?? 0) + 1);
    }
  }

  report(meta: { dumpPath: string; generatedAt: string }, topN = 30): CensusReport {
    const params: Record<string, ParamStats> = {};
    const keys = [...this.params.keys()].sort(
      (a, b) => this.params.get(b)!.filled - this.params.get(a)!.filled || a.localeCompare(b),
    );
    for (const key of keys) {
      const state = this.params.get(key)!;
      params[key] = {
        filled: state.filled,
        distinctValues: state.values.size,
        distinctCapped: state.capped,
        topValues: topOf(state.values, topN),
      };
    }
    return {
      ...meta,
      namespace0Pages: this.namespace0Pages,
      formularPages: this.formularPageIds.size,
      formularPageBlocks: this.formularPageBlocks,
      pagesWithCases: this.pagesWithCases,
      maxCaseNumber: this.maxCaseNumber,
      params,
      topCategories: topOf(this.categories, 500),
    };
  }

  private countParam(key: string, value: string): void {
    let state = this.params.get(key);
    if (!state) {
      state = { filled: 0, values: new Map(), capped: false };
      this.params.set(key, state);
    }
    state.filled++;
    const existing = state.values.get(value);
    if (existing !== undefined) {
      state.values.set(value, existing + 1);
    } else if (state.values.size < this.maxDistinct) {
      state.values.set(value, 1);
    } else {
      state.capped = true;
    }
  }
}
