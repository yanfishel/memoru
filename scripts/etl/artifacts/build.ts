import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import { findLatestReportFile } from "../check";
import type { EtlConfig } from "../config";
import { INDEX_SETTINGS } from "../search/documents";
import { servingDocuments, writeDocumentsJsonl } from "../search/documents-io";
import { assertBuildId, searchIndexName, servingSchemaName } from "../serving/build-id";
import { readServingSlot } from "../serving/slot";
import { describeFile, documentsFileName, dumpFileName, writeManifest, type Manifest } from "./manifest";
import { runPgTool, toolPath } from "./pg-tools";

type BuildConfig = Pick<EtlConfig, "databaseUrl" | "pgTools" | "pgToolsArtifactsDir" | "artifactsDir" | "reportsDir">;

export interface BuildArtifactsOptions {
  buildId?: string;
  /** Host directory to write into; pairs with `toolsOut`. */
  out?: string;
  /** The same directory as pg_dump sees it (it writes the dump itself). */
  toolsOut?: string;
  batchSize?: number;
  onProgress?: (message: string) => void;
}

export async function buildArtifacts(
  pool: pg.Pool,
  config: BuildConfig,
  options: BuildArtifactsOptions,
): Promise<{ dir: string; manifest: Manifest }> {
  // pg_dump writes the dump itself, so a custom host directory is useless without the path
  // the tools reach it by; guessing one would silently write the dump somewhere else.
  if (options.out !== undefined && options.toolsOut === undefined) {
    throw new Error("--out requires --tools-out (the same directory as the tools see it)");
  }
  const slot = await readServingSlot(pool);
  if (!slot) throw new Error("no serving build: run `pnpm etl aggregate` and `pnpm etl index` first");
  const buildId = options.buildId ?? slot.activeSchema.replace(/^serving_/, "");
  assertBuildId(buildId);
  const schema = servingSchemaName(buildId);
  const index = searchIndexName(buildId);
  if (slot.activeSchema !== schema) throw new Error(`build ${buildId} is not the active serving schema (${slot.activeSchema})`);
  if (slot.searchIndex !== index) throw new Error(`search index ${index} is not registered (slot has ${slot.searchIndex ?? "none"}): run \`pnpm etl index\``);

  const info = (await pool.query(`SELECT value FROM ${schema}.build_info WHERE key = 'build'`)).rows[0]?.value as
    | { dataDate: string | null; persons: number; cases: number }
    | undefined;
  if (!info) throw new Error(`${schema}.build_info has no build row`);

  // The manifest attests the check that gated this build, so the report has to describe this
  // build's data: `findLatestReportFile` returns the newest report on disk, whatever it was
  // computed from (aggregate re-run after check, a report from another database).
  const coverage = findLatestReportFile(config.reportsDir);
  if (coverage && (coverage.report.persons !== info.persons || coverage.report.cases !== info.cases)) {
    throw new Error(
      `coverage report ${coverage.file} does not match build ${buildId} ` +
        `(persons ${coverage.report.persons} vs ${info.persons}, cases ${coverage.report.cases} vs ${info.cases}): run pnpm etl check first`,
    );
  }

  const dir = join(options.out ?? config.artifactsDir, buildId);
  await mkdir(dir, { recursive: true });

  options.onProgress?.(`dumping ${schema}`);
  const dump = dumpFileName(buildId);
  await runPgTool(config, "pg_dump", [
    `--dbname=${config.databaseUrl}`, "--format=custom", `--schema=${schema}`, "--no-owner", "--no-privileges",
    "--file", toolPath(options.toolsOut ?? config.pgToolsArtifactsDir, buildId, dump),
  ]);

  options.onProgress?.(`exporting documents from ${schema}`);
  const documents = documentsFileName(buildId);
  const exported = await writeDocumentsJsonl(servingDocuments(pool, schema, options.batchSize ?? 20_000), join(dir, documents));
  if (exported.documents !== info.persons) {
    throw new Error(`exported ${exported.documents} documents but the build has ${info.persons} persons`);
  }

  options.onProgress?.("hashing");
  const manifest: Manifest = {
    version: 1,
    buildId,
    schema,
    index,
    createdAt: new Date().toISOString(),
    dataDate: info.dataDate,
    persons: info.persons,
    cases: info.cases,
    documents: exported.documents,
    settings: INDEX_SETTINGS,
    coverage: coverage?.report ?? null,
    files: [await describeFile(dir, dump), await describeFile(dir, documents)],
  };
  await writeManifest(dir, manifest);
  return { dir, manifest };
}
