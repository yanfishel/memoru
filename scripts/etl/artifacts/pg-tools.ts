import { spawn } from "node:child_process";
import type { EtlConfig } from "../config";

/** Runs pg_dump/pg_restore through the PG_TOOLS argv prefix (by default inside the
 * Postgres container, which sees ARTIFACTS_DIR at PG_TOOLS_ARTIFACTS_DIR). */
export function runPgTool(config: Pick<EtlConfig, "pgTools">, tool: "pg_dump" | "pg_restore", args: string[]): Promise<void> {
  const [command, ...prefix] = config.pgTools;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, tool, ...args], { stdio: ["ignore", "inherit", "inherit"], shell: false });
    // Never surface Node's own spawn error: its `spawnargs` carry --dbname=<url>, password included.
    child.on("error", ({ code, message }: NodeJS.ErrnoException) => reject(new Error(`${tool} could not start: ${code ?? message}`)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${tool} exited with code ${code}`))));
  });
}

/** Path of a file in the artifacts directory as the tools see it (`pgToolsArtifactsDir`, or
 * the --tools-out/--tools-from override that pairs with a custom host directory). */
export function toolPath(toolsDir: string, buildId: string, name: string): string {
  return `${toolsDir.replace(/\/$/, "")}/${buildId}/${name}`;
}
