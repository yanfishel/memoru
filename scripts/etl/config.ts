import { DEFAULT_ENDPOINT } from "./api/client";

export interface EtlConfig {
  databaseUrl: string;
  dumpPath: string | undefined;
  sevenZipPath: string;
  dumpEntry: string;
  dictsDir: string;
  reportsDir: string;
  apiEndpoint: string;
  apiUserAgent?: string;
  apiMinIntervalMs: number;
  meiliUrl: string;
  meiliMasterKey: string;
  meiliTaskTimeoutMs: number;
  pgTools: string[];
  pgToolsArtifactsDir: string;
  artifactsDir: string;
  shipTarget: string | undefined;
  rsync: string[];
  revalidateUrl: string | undefined;
  revalidateSecret: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EtlConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  // Not required here: the server never calls the wiki API (it runs no ETL beyond
  // restore-and-swap), so loadConfig must succeed without it. Only the `sync` command
  // touches the wiki, and it enforces this itself via requireApiUserAgent below.
  const apiUserAgent = env.API_USER_AGENT || undefined;
  const apiMinIntervalMsRaw = env.API_MIN_INTERVAL_MS || "1000";
  const apiMinIntervalMs = Number(apiMinIntervalMsRaw);
  if (!Number.isFinite(apiMinIntervalMs) || apiMinIntervalMs < 0) {
    throw new Error(`API_MIN_INTERVAL_MS must be a finite, non-negative number, got "${apiMinIntervalMsRaw}"`);
  }
  const meiliUrl = env.MEILI_URL;
  if (!meiliUrl) throw new Error("MEILI_URL is not set");
  const meiliMasterKey = env.MEILI_MASTER_KEY;
  if (!meiliMasterKey) throw new Error("MEILI_MASTER_KEY is not set");
  // Meilisearch's own task record is authoritative for whether an operation succeeded; this
  // is only how long the ETL polls before giving up on it. On slow/small hardware (a 1 vCPU
  // droplet observed 37m40s for `updateSettings` on 3.3M documents) the default must clear
  // that comfortably, so it defaults to two hours rather than the client library's default.
  const meiliTaskTimeoutMsRaw = env.MEILI_TASK_TIMEOUT_MS || String(2 * 60 * 60_000);
  const meiliTaskTimeoutMs = Number(meiliTaskTimeoutMsRaw);
  if (!Number.isFinite(meiliTaskTimeoutMs) || meiliTaskTimeoutMs <= 0) {
    throw new Error(`MEILI_TASK_TIMEOUT_MS must be a finite, positive number, got "${meiliTaskTimeoutMsRaw}"`);
  }
  const argv = (value: string | undefined, fallback: string[]) =>
    value && value.trim() !== "" ? value.trim().split(/\s+/) : fallback;
  return {
    databaseUrl,
    dumpPath: env.DUMP_PATH || undefined,
    sevenZipPath: env.SEVEN_ZIP_PATH || "7z",
    dumpEntry: env.DUMP_ENTRY || "*history.xml",
    dictsDir: env.DICTS_DIR || "data/dicts",
    reportsDir: env.REPORTS_DIR || "data/reports",
    apiEndpoint: env.API_ENDPOINT || DEFAULT_ENDPOINT,
    apiUserAgent,
    apiMinIntervalMs,
    meiliUrl,
    meiliMasterKey,
    meiliTaskTimeoutMs,
    pgTools: argv(env.PG_TOOLS, ["docker", "compose", "exec", "-T", "postgres"]),
    pgToolsArtifactsDir: env.PG_TOOLS_ARTIFACTS_DIR || "/artifacts",
    artifactsDir: env.ARTIFACTS_DIR || ".artifacts",
    shipTarget: env.SHIP_TARGET || undefined,
    rsync: argv(env.RSYNC, process.platform === "win32" ? ["wsl", "rsync"] : ["rsync"]),
    revalidateUrl: env.REVALIDATE_URL || undefined,
    revalidateSecret: env.REVALIDATE_SECRET || undefined,
  };
}

// Only `sync` calls the live wiki API, and it must call this before constructing the API
// client. Keeping the check here (rather than in loadConfig) means every other command —
// including everything the server runs — can load its config without declaring a wiki
// contact it will never use.
export function requireApiUserAgent(config: Pick<EtlConfig, "apiUserAgent">): string {
  if (!config.apiUserAgent) {
    throw new Error(
      "API_USER_AGENT is not set: the wiki needs a descriptive user agent with a contact, e.g. \"memoru/1.0 (+https://github.com/<repo>; <email>)\"",
    );
  }
  return config.apiUserAgent;
}
