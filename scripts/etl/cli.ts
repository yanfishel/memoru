import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { ApiClient } from "./api/client";
import { buildArtifacts } from "./artifacts/build";
import { publishArtifacts, rollbackServing } from "./artifacts/publish";
import { shipArtifacts } from "./artifacts/ship";
import { CensusAccumulator, type CensusReport } from "./census";
import { computeCoverage, evaluateChecks, findLatestReport } from "./check";
import { loadConfig, requireApiUserAgent } from "./config";
import { createPool } from "./db/pool";
import { openDump } from "./dump/open-dump";
import { readDumpPages, type DumpPage } from "./dump/read-dump";
import { Reservoir, dedupeByHighestRevId, renderDumpXml } from "./fixtures";
import { importDump } from "./import";
import { loadAllDictionaries, DICT_FIELDS, type DictField } from "./normalize/dicts";
import { normalizeStaging } from "./normalize/run";
import { parseFormular } from "./parse/formular";
import { splitCases } from "./parse/cases";
import { createSearchClient } from "./search/client";
import { buildSearchIndex } from "./search/index";
import { buildServing, readServingSlot } from "./serving/build";
import { deriveBuildId } from "./serving/build-id";
import { expectedCodes, loadLabels, missingLabels, renderMissingCsv } from "./serving/labels";
import { readSyncCheckpoint, syncFromApi } from "./sync";
import { listValues, renderValuesCsv } from "./values";

function requireDumpPath(option: string | undefined): string {
  const path = option ?? process.env.DUMP_PATH;
  if (!path) throw new Error("Pass --dump <path> or set DUMP_PATH");
  return path;
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const program = new Command();
program.name("etl").description("Open List ETL");

program
  .command("db-ping")
  .description("Check the database connection")
  .action(async () => {
    const pool = createPool(loadConfig().databaseUrl);
    try {
      await pool.query("SELECT 1");
      console.log("ok");
    } finally {
      await pool.end();
    }
  });

program
  .command("census")
  .description("Report every Формуляр parameter with fill counts and top values")
  .option("--dump <path>", "dump file (.xml or .7z); defaults to DUMP_PATH")
  .option("--out <file>", "output JSON", "data/reports/census.json")
  .option("--limit <n>", "stop after n namespace-0 pages", (v) => Number(v))
  .action(async (opts: { dump?: string; out: string; limit?: number }) => {
    const dumpPath = requireDumpPath(opts.dump);
    const sevenZip = process.env.SEVEN_ZIP_PATH || "7z";
    const dumpEntry = process.env.DUMP_ENTRY || "*history.xml";
    const acc = new CensusAccumulator();
    let seen = 0;
    for await (const page of readDumpPages(openDump(sevenZip, dumpPath, dumpEntry))) {
      acc.add(page);
      seen++;
      if (seen % 100_000 === 0) console.error(`census: ${seen} pages`);
      if (opts.limit !== undefined && seen >= opts.limit) break;
    }
    const report = acc.report({ dumpPath, generatedAt: new Date().toISOString() });
    writeJson(opts.out, report);
    console.log(
      `census: ${report.namespace0Pages} pages, ${report.formularPages} with Формуляр, ` +
        `${Object.keys(report.params).length} params -> ${opts.out}`,
    );
  });

program
  .command("sample-fixtures")
  .description("Sample real Формуляр pages into a small fixture dump")
  .option("--dump <path>", "dump file (.xml or .7z); defaults to DUMP_PATH")
  .option("--count <n>", "random Формуляр pages", (v) => Number(v), 250)
  .option("--multi-case <n>", "extra random pages with 2+ cases", (v) => Number(v), 50)
  .option("--out <file>", "output XML", "data/fixtures/pages.xml")
  .action(async (opts: { dump?: string; count: number; multiCase: number; out: string }) => {
    const dumpPath = requireDumpPath(opts.dump);
    const sevenZip = process.env.SEVEN_ZIP_PATH || "7z";
    const dumpEntry = process.env.DUMP_ENTRY || "*history.xml";
    const general = new Reservoir<DumpPage>(opts.count);
    const multi = new Reservoir<DumpPage>(opts.multiCase);
    let seen = 0;
    for await (const page of readDumpPages(openDump(sevenZip, dumpPath, dumpEntry))) {
      seen++;
      if (seen % 100_000 === 0) console.error(`sample-fixtures: ${seen} pages`);
      const formular = parseFormular(page.text);
      if (!formular) continue;
      general.offer(page);
      if (splitCases(formular.params).cases.length >= 2) multi.offer(page);
    }
    // The dump repeats a page id across scattered blocks (see import.ts); when two
    // sampled blocks share a page id, keep the one with the higher revId.
    const pages = dedupeByHighestRevId([...general.items(), ...multi.items()]).sort(
      (a, b) => a.pageId - b.pageId,
    );
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, renderDumpXml(pages), "utf8");
    console.log(`sample-fixtures: wrote ${pages.length} pages -> ${opts.out}`);
  });

program
  .command("import")
  .description("Load Формуляр pages from the dump into staging.person_raw (recreates staging)")
  .option("--dump <path>", "dump file (.xml or .7z); defaults to DUMP_PATH")
  .option("--limit <n>", "stop after n namespace-0 pages", (v) => Number(v))
  .action(async (opts: { dump?: string; limit?: number }) => {
    const config = loadConfig();
    const dumpPath = requireDumpPath(opts.dump);
    const pool = createPool(config.databaseUrl);
    try {
      const stats = await importDump(pool, readDumpPages(openDump(config.sevenZipPath, dumpPath, config.dumpEntry)), {
        limit: opts.limit,
        dumpPath,
        onProgress: (seen) => console.error(`import: ${seen} pages`),
      });
      console.log(`import: ${JSON.stringify(stats)}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("normalize")
  .description("Normalize staging.person_raw into staging.person and staging.person_case")
  .option("--batch-size <n>", "rows per batch", (v) => Number(v), 10_000)
  .action(async (opts: { batchSize: number }) => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const stats = await normalizeStaging(pool, loadAllDictionaries(config.dictsDir), {
        batchSize: opts.batchSize,
        onProgress: (n) => {
          if (n % 100_000 < opts.batchSize) console.error(`normalize: ${n} persons`);
        },
      });
      console.log(`normalize: ${JSON.stringify(stats)}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("values <param>")
  .description("List distinct raw values of a Формуляр parameter (or @category) with counts and current codes")
  .option("--dict <field>", `dictionary to map codes: ${DICT_FIELDS.join(", ")}`)
  .option("--first-segment", "use only the text before the first comma")
  .option("--limit <n>", "max rows", (v) => Number(v), 500)
  .option("--out <file>", "write CSV to a file instead of stdout")
  .action(async (param: string, opts: { dict?: string; firstSegment?: boolean; limit: number; out?: string }) => {
    const config = loadConfig();
    if (opts.dict && !DICT_FIELDS.includes(opts.dict as DictField)) {
      throw new Error(`Unknown dictionary "${opts.dict}". Expected one of: ${DICT_FIELDS.join(", ")}`);
    }
    const dict = opts.dict ? loadAllDictionaries(config.dictsDir)[opts.dict as DictField] : undefined;
    const pool = createPool(config.databaseUrl);
    try {
      const csv = renderValuesCsv(await listValues(pool, param, { dict, firstSegment: opts.firstSegment, limit: opts.limit }));
      if (opts.out) {
        mkdirSync(dirname(opts.out), { recursive: true });
        writeFileSync(opts.out, csv, "utf8");
      } else {
        process.stdout.write(csv);
      }
    } finally {
      await pool.end();
    }
  });

program
  .command("check")
  .description("Compute coverage of staging data and evaluate publish checks")
  .option("--census <file>", "census report", "data/reports/census.json")
  .action(async (opts: { census: string }) => {
    const config = loadConfig();
    if (!existsSync(opts.census)) throw new Error(`${opts.census} not found: run "pnpm etl census" first`);
    const census = JSON.parse(readFileSync(opts.census, "utf8")) as CensusReport;
    const pool = createPool(config.databaseUrl);
    try {
      const now = new Date();
      const report = await computeCoverage(pool, now.toISOString());
      const previous = findLatestReport(config.reportsDir);
      const failures = evaluateChecks({ report, previous, censusFormularPages: census.formularPages });
      for (const [field, cov] of Object.entries(report.fields)) {
        console.log(`${field.padEnd(14)} ${(cov.share * 100).toFixed(1).padStart(5)}%  (${cov.known})`);
      }
      if (failures.length > 0) {
        writeJson(".tmp/coverage-failed.json", report);
        for (const failure of failures) console.error(`FAIL: ${failure}`);
        process.exitCode = 1;
        return;
      }
      const file = join(config.reportsDir, `coverage-${now.toISOString().slice(0, 10)}.json`);
      writeJson(file, report);
      console.log(`check: passed -> ${file}`);
    } finally {
      await pool.end();
    }
  });

interface SyncCliOptions {
  since?: string;
  limitRevisions?: number;
  limitLogEvents?: number;
  excludeUser?: string;
  dryRun?: boolean;
}

program
  .command("sync")
  .description("Fetch changes from the Open List API into staging.person_raw")
  .option("--since <timestamp>", "ISO timestamp to start from; defaults to the stored checkpoint")
  .option("--limit-revisions <n>", "stop after walking n revisions (for smoke runs)", (v) => Number(v))
  .option(
    "--limit-log-events <n>",
    "stop after walking n delete-log events (defaults to 5x --limit-revisions, else unbounded)",
    (v) => Number(v),
  )
  .option("--exclude-user <name>", "exclude this username's edits from the revision walk")
  .option("--dry-run", "fetch and report, write nothing")
  .action(async (opts: SyncCliOptions) => {
    const config = loadConfig();
    const apiUserAgent = requireApiUserAgent(config);
    const pool = createPool(config.databaseUrl);
    try {
      let retryCount = 0;
      const client = new ApiClient({
        endpoint: config.apiEndpoint,
        userAgent: apiUserAgent,
        minIntervalMs: config.apiMinIntervalMs,
        onRetry: (e) => {
          retryCount++;
          console.error(`sync: retry ${e.attempt + 1} after ${e.reason}, waiting ${e.delayMs} ms`);
        },
      });
      const checkpoint = await readSyncCheckpoint(pool);
      console.error(`sync: checkpoint ${checkpoint ?? "none"}`);
      const stats = await syncFromApi(pool, client, {
        since: opts.since,
        limitRevisions: opts.limitRevisions,
        limitLogEvents: opts.limitLogEvents,
        excludeUser: opts.excludeUser,
        dryRun: opts.dryRun,
        onProgress: (message) => console.error(`sync: ${message}`),
      });
      console.log(`sync: ${JSON.stringify(stats)}`);
      console.error(`sync: ${client.requestCount} API requests`);
      console.error(`sync: ${retryCount} retries`);
    } finally {
      await pool.end();
    }
  });

program
  .command("labels")
  .description("List codes that have no display label in data/labels.csv (exit 1 if any)")
  .option("--labels <file>", "labels CSV", "data/labels.csv")
  .action((opts: { labels: string }) => {
    const config = loadConfig();
    const labels = existsSync(opts.labels) ? loadLabels(opts.labels) : [];
    const missing = missingLabels(expectedCodes(loadAllDictionaries(config.dictsDir)), labels);
    if (missing.length === 0) {
      console.log(`labels: all ${labels.length} codes labelled`);
      return;
    }
    process.stdout.write(renderMissingCsv(missing));
    console.error(`labels: ${missing.length} codes without a label`);
    process.exitCode = 1;
  });

program
  .command("aggregate")
  .description("Build the serving schema (persons, cases, labels, aggregates) and make it active")
  .option("--build-id <id>", "YYYYMMDD[_suffix]; defaults to the data date")
  .option("--labels <file>", "labels CSV", "data/labels.csv")
  .option("--force", "rebuild the active build in place (readers stall until COMMIT)")
  .action(async (opts: { buildId?: string; labels: string; force?: boolean }) => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const syncUntil = await readSyncCheckpoint(pool);
      const importMeta = (await pool.query(`SELECT value FROM staging.import_meta WHERE key = 'import'`)).rows[0]?.value as
        | { finishedAt?: string }
        | undefined;
      const buildId = opts.buildId ?? deriveBuildId({ syncUntil, importFinishedAt: importMeta?.finishedAt ?? null, now: new Date() });
      const dataDate = (syncUntil ?? importMeta?.finishedAt ?? null)?.slice(0, 10) ?? null;
      const result = await buildServing(pool, {
        buildId,
        labels: loadLabels(opts.labels),
        dataDate,
        dictsDir: config.dictsDir,
        force: opts.force,
        searchClient: createSearchClient({ host: config.meiliUrl, apiKey: config.meiliMasterKey }),
        onProgress: (message) => console.error(`aggregate: ${message}`),
      });
      console.log(`aggregate: ${JSON.stringify(result)}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("index")
  .description("Build the Meilisearch index from the active serving schema and register it")
  .option("--build-id <id>", "defaults to the active serving schema's build id")
  .option("--batch-size <n>", "documents per batch", (v) => Number(v), 20_000)
  .option("--force", "rebuild the registered search index in place (searches find nothing until it is refilled)")
  .action(async (opts: { buildId?: string; batchSize: number; force?: boolean }) => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const slot = await readServingSlot(pool);
      if (!slot) throw new Error("no serving schema: run `pnpm etl aggregate` first");
      const buildId = opts.buildId ?? slot.activeSchema.replace(/^serving_/, "");
      const result = await buildSearchIndex(pool, createSearchClient({ host: config.meiliUrl, apiKey: config.meiliMasterKey }), {
        buildId,
        batchSize: opts.batchSize,
        force: opts.force,
        taskTimeoutMs: config.meiliTaskTimeoutMs,
        onProgress: (done) => console.error(`index: ${done} documents`),
      });
      console.log(`index: ${JSON.stringify(result)}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("build-artifacts")
  .description("Dump the active serving schema and export the search documents with a manifest")
  .option("--build-id <id>", "defaults to the active build")
  .option("--out <dir>", "output root; defaults to ARTIFACTS_DIR. Needs --tools-out")
  .option("--tools-out <dir>", "the same directory as pg_dump sees it (PG_TOOLS may run in a container); required with --out")
  .action(async (opts: { buildId?: string; out?: string; toolsOut?: string }) => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const { dir, manifest } = await buildArtifacts(pool, config, {
        buildId: opts.buildId,
        out: opts.out,
        toolsOut: opts.toolsOut,
        onProgress: (message) => console.error(`build-artifacts: ${message}`),
      });
      const bytes = manifest.files.reduce((sum, f) => sum + f.bytes, 0);
      console.log(`build-artifacts: ${JSON.stringify({ dir, buildId: manifest.buildId, persons: manifest.persons, documents: manifest.documents, bytes })}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("ship")
  .description("Transfer a build's artifacts to the server with rsync and verify the checksums there")
  .requiredOption("--build-id <id>", "build to ship")
  .option("--target <target>", "user@host:/dir or a local directory; defaults to SHIP_TARGET")
  .action(async (opts: { buildId: string; target?: string }) => {
    const config = loadConfig();
    const result = await shipArtifacts(config, { ...opts, onProgress: (message) => console.error(`ship: ${message}`) });
    console.log(`ship: ${JSON.stringify(result)}`);
  });

program
  .command("publish")
  .description("Server: restore a shipped build, index its documents, verify and swap it live")
  .requiredOption("--build-id <id>", "build to publish")
  .option("--from <dir>", "artifacts root; defaults to ARTIFACTS_DIR. Needs --tools-from")
  .option("--tools-from <dir>", "the same directory as pg_restore sees it (PG_TOOLS may run in a container); required with --from")
  .option("--force", "replace the previous build (the rollback target) instead of refusing")
  .option("--batch-size <n>", "documents per indexing batch", (v) => Number(v), 20_000)
  .action(async (opts: { buildId: string; from?: string; toolsFrom?: string; force?: boolean; batchSize: number }) => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const result = await publishArtifacts(pool, createSearchClient({ host: config.meiliUrl, apiKey: config.meiliMasterKey }), config, {
        ...opts,
        onProgress: (message) => console.error(`publish: ${message}`),
      });
      console.log(`publish: ${JSON.stringify(result)}`);
    } finally {
      await pool.end();
    }
  });

program
  .command("rollback")
  .description("Server: make the previous build active again")
  .action(async () => {
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    try {
      const result = await rollbackServing(pool, createSearchClient({ host: config.meiliUrl, apiKey: config.meiliMasterKey }), config, {
        onProgress: (message) => console.error(`rollback: ${message}`),
      });
      console.log(`rollback: ${JSON.stringify(result)}`);
    } finally {
      await pool.end();
    }
  });

// No top-level await: package.json has no "type": "module", so tsx runs this file as CommonJS.
program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
