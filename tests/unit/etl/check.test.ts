import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COVERAGE_FIELDS, evaluateChecks, findLatestReport, type CoverageReport } from "../../../scripts/etl/check";

function report(overrides: { persons?: number; pages?: number; errors?: number; shares?: Partial<Record<string, number>> } = {}): CoverageReport {
  const persons = overrides.persons ?? 1000;
  const fields = Object.fromEntries(
    COVERAGE_FIELDS.map((f) => {
      const share = overrides.shares?.[f] ?? 0.5;
      return [f, { known: Math.round(share * persons), share }];
    }),
  ) as CoverageReport["fields"];
  return {
    generatedAt: "2026-09-16T00:00:00Z",
    persons,
    cases: persons,
    pages: overrides.pages ?? persons,
    errors: overrides.errors ?? 0,
    fields,
  };
}

describe("evaluateChecks", () => {
  it("passes a healthy first run", () => {
    expect(evaluateChecks({ report: report(), previous: null, censusFormularPages: 1000 })).toEqual([]);
  });

  it("fails when persons are below 95% of census Формуляр pages", () => {
    expect(evaluateChecks({ report: report({ persons: 949 }), previous: null, censusFormularPages: 1000 })).toEqual([
      "persons 949 < 95% of census Формуляр pages (1000)",
    ]);
  });

  it("allows exactly 95%", () => {
    expect(evaluateChecks({ report: report({ persons: 950 }), previous: null, censusFormularPages: 1000 })).toEqual([]);
  });

  it("fails on a coverage drop of more than 5 points for key fields only", () => {
    const previous = report({ shares: { sex: 0.9, birth_year: 0.8, arrest_year: 0.7, nationality: 0.9 } });
    const current = report({ shares: { sex: 0.84, birth_year: 0.75, arrest_year: 0.7, nationality: 0.1 } });
    expect(evaluateChecks({ report: current, previous, censusFormularPages: 1000 })).toEqual([
      "sex coverage dropped from 90.0% to 84.0%",
    ]);
  });

  it("fails when errors exceed 1% of pages", () => {
    expect(evaluateChecks({ report: report({ pages: 1000, errors: 11 }), previous: null, censusFormularPages: 1000 })).toEqual([
      "errors 11 > 1% of pages (1000)",
    ]);
    expect(evaluateChecks({ report: report({ pages: 1000, errors: 10 }), previous: null, censusFormularPages: 1000 })).toEqual([]);
  });
});

describe("findLatestReport", () => {
  it("returns null for an empty directory and the last coverage report otherwise", () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-reports-"));
    expect(findLatestReport(dir)).toBeNull();
    writeFileSync(join(dir, "coverage-2026-09-01.json"), JSON.stringify(report({ persons: 1 })));
    writeFileSync(join(dir, "coverage-2026-09-15.json"), JSON.stringify(report({ persons: 2 })));
    writeFileSync(join(dir, "census.json"), "{}");
    expect(findLatestReport(dir)?.persons).toBe(2);
  });
});
