export interface CaseParams {
  n: number;
  params: Record<string, string>;
}

export interface SplitParams {
  person: Record<string, string>;
  cases: CaseParams[];
}

const NUMBERED_KEY = /^(.+?)\s+(\d+)$/;

// A dump-wide scan (2026-09-16, 2,000,000 pages) found exactly one page whose numbered
// key exceeded this: "место проживания до 1930" / "после 1930", a year embedded in the
// parameter name, not a case index. Real case numbers top out around 11. Anything above
// this threshold is kept as a plain person-level key instead of becoming a bogus case.
export const MAX_CASE_NUMBER = 50;

export function splitCases(params: Record<string, string>): SplitParams {
  const person: Record<string, string> = {};
  const byNumber = new Map<number, Record<string, string>>();

  for (const [key, value] of Object.entries(params)) {
    const match = NUMBERED_KEY.exec(key);
    if (!match || Number(match[2]) > MAX_CASE_NUMBER) {
      person[key] = value;
      continue;
    }
    const n = Number(match[2]);
    const caseParams = byNumber.get(n) ?? {};
    caseParams[match[1]] = value;
    byNumber.set(n, caseParams);
  }

  const cases = [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, caseParams]) => ({ n, params: caseParams }));
  return { person, cases };
}
