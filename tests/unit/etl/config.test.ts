import { describe, expect, it } from "vitest";
import { loadConfig, requireApiUserAgent } from "../../../scripts/etl/config";

describe("loadConfig", () => {
  it("reads required and optional values with defaults", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toEqual({
      databaseUrl: "postgres://u:p@localhost:5432/db",
      dumpPath: undefined,
      sevenZipPath: "7z",
      dumpEntry: "*history.xml",
      dictsDir: "data/dicts",
      reportsDir: "data/reports",
      apiEndpoint: "https://ru.openlist.wiki/api.php",
      apiUserAgent: "memoru/1.0 (contact@example)",
      apiMinIntervalMs: 1000,
      meiliUrl: "http://localhost:7700",
      meiliMasterKey: "k",
      meiliTaskTimeoutMs: 2 * 60 * 60_000,
      pgTools: ["docker", "compose", "exec", "-T", "postgres"],
      pgToolsArtifactsDir: "/artifacts",
      artifactsDir: ".artifacts",
      shipTarget: undefined,
      rsync: process.platform === "win32" ? ["wsl", "rsync"] : ["rsync"],
      revalidateUrl: undefined,
      revalidateSecret: undefined,
    });
  });

  it("uses overrides", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
      DUMP_PATH: "/path/to/dump.xml.7z",
      SEVEN_ZIP_PATH: "/usr/bin/7z",
      DUMP_ENTRY: "ruopenlistwiki-20230301-history.xml",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.dumpPath).toBe("/path/to/dump.xml.7z");
    expect(cfg.sevenZipPath).toBe("/usr/bin/7z");
    expect(cfg.dumpEntry).toBe("ruopenlistwiki-20230301-history.xml");
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => loadConfig({} as unknown as NodeJS.ProcessEnv)).toThrow("DATABASE_URL is not set");
  });

  it("reads API settings with defaults", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.apiEndpoint).toBe("https://ru.openlist.wiki/api.php");
    expect(cfg.apiUserAgent).toBe("memoru/1.0 (contact@example)");
    expect(cfg.apiMinIntervalMs).toBe(1000);
  });

  it("succeeds with API_USER_AGENT unset (the server never calls the wiki API)", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.apiUserAgent).toBeUndefined();
  });

  it("requireApiUserAgent throws for a config without one", () => {
    expect(() => requireApiUserAgent({ apiUserAgent: undefined })).toThrow(
      /API_USER_AGENT is not set: the wiki needs a descriptive user agent with a contact/,
    );
  });

  it("falls back to the default interval when API_MIN_INTERVAL_MS is empty", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
      API_MIN_INTERVAL_MS: "",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.apiMinIntervalMs).toBe(1000);
  });

  it("rejects a malformed API_MIN_INTERVAL_MS", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://x",
        API_USER_AGENT: "memoru/1.0 (contact@example)",
        MEILI_URL: "http://localhost:7700",
        MEILI_MASTER_KEY: "k",
        API_MIN_INTERVAL_MS: "abc",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/API_MIN_INTERVAL_MS/);
  });

  it("defaults MEILI_TASK_TIMEOUT_MS to two hours", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.meiliTaskTimeoutMs).toBe(2 * 60 * 60_000);
  });

  it("honours an explicit MEILI_TASK_TIMEOUT_MS", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x",
      API_USER_AGENT: "memoru/1.0 (contact@example)",
      MEILI_URL: "http://localhost:7700",
      MEILI_MASTER_KEY: "k",
      MEILI_TASK_TIMEOUT_MS: "60000",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.meiliTaskTimeoutMs).toBe(60_000);
  });

  it("rejects a malformed MEILI_TASK_TIMEOUT_MS", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://x",
        API_USER_AGENT: "memoru/1.0 (contact@example)",
        MEILI_URL: "http://localhost:7700",
        MEILI_MASTER_KEY: "k",
        MEILI_TASK_TIMEOUT_MS: "abc",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MEILI_TASK_TIMEOUT_MS/);
  });

  it("rejects a non-positive MEILI_TASK_TIMEOUT_MS", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://x",
        API_USER_AGENT: "memoru/1.0 (contact@example)",
        MEILI_URL: "http://localhost:7700",
        MEILI_MASTER_KEY: "k",
        MEILI_TASK_TIMEOUT_MS: "0",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MEILI_TASK_TIMEOUT_MS/);
  });

  it("requires the Meilisearch settings", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", API_USER_AGENT: "memoru/1.0 (contact@example)" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MEILI_URL/);
  });

  it("reads artifact settings with defaults", () => {
    const cfg = loadConfig({ DATABASE_URL: "postgres://x", API_USER_AGENT: "a (b)", MEILI_URL: "http://m", MEILI_MASTER_KEY: "k" } as unknown as NodeJS.ProcessEnv);
    expect(cfg.pgTools).toEqual(["docker", "compose", "exec", "-T", "postgres"]);
    expect(cfg.pgToolsArtifactsDir).toBe("/artifacts");
    expect(cfg.artifactsDir).toBe(".artifacts");
    expect(cfg.shipTarget).toBeUndefined();
    expect(cfg.rsync).toEqual(process.platform === "win32" ? ["wsl", "rsync"] : ["rsync"]);
  });

  it("splits PG_TOOLS and RSYNC on whitespace", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgres://x", API_USER_AGENT: "a (b)", MEILI_URL: "http://m", MEILI_MASTER_KEY: "k",
      PG_TOOLS: "pg_dump-wrapper", RSYNC: "wsl -d Ubuntu rsync", SHIP_TARGET: "deploy@vps:/srv/memoru/artifacts",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.pgTools).toEqual(["pg_dump-wrapper"]);
    expect(cfg.rsync).toEqual(["wsl", "-d", "Ubuntu", "rsync"]);
    expect(cfg.shipTarget).toBe("deploy@vps:/srv/memoru/artifacts");
  });
});
