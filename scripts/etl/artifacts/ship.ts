import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { EtlConfig } from "../config";
import { assertBuildId } from "../serving/build-id";
import { CHECKSUM_FILE, readManifest, verifyChecksums } from "./manifest";

export function parseShipTarget(target: string): { host: string | null; dir: string } {
  const match = /^([^:\\/]+):(.+)$/.exec(target);
  if (match && match[1].length > 1) return { host: match[1], dir: match[2] };
  return { host: null, dir: target };
}

/** rsync inside WSL sees Windows drives under /mnt. */
export function toWslPath(path: string): string {
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!drive) return path.replace(/\\/g, "/");
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
}

const usesWsl = (prefix: string[]) => prefix[0] === "wsl";

function localPath(prefix: string[], path: string): string {
  return usesWsl(prefix) ? toWslPath(path) : path;
}

export function rsyncArgs(input: { rsync: string[]; sourceDir: string; target: { host: string | null; dir: string }; buildId: string }): string[] {
  const source = `${localPath(input.rsync, input.sourceDir).replace(/\/$/, "")}/`;
  const destDir = `${input.target.dir.replace(/[\\/]$/, "")}/${input.buildId}/`;
  const destination = input.target.host ? `${input.target.host}:${destDir}` : localPath(input.rsync, destDir);
  // --partial keeps an interrupted transfer resumable. Never --append-verify: it is resume-only
  // and skips any file whose size on the receiver already matches, so re-shipping a rebuilt
  // artifact under the same build id would leave the previous dump (and its checksums) in place.
  return [...input.rsync, "-av", "--partial", "--progress", "--mkpath", source, destination];
}

export function remoteVerifyArgs(input: { rsync: string[]; host: string; dir: string; buildId: string }): string[] {
  const prefix = usesWsl(input.rsync) ? input.rsync.slice(0, -1) : [];
  const dir = `${input.dir.replace(/\/$/, "")}/${input.buildId}`;
  return [...prefix, "ssh", input.host, `cd '${dir}' && sha256sum -c ${CHECKSUM_FILE}`];
}

function run(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`))));
  });
}

export async function shipArtifacts(
  config: Pick<EtlConfig, "rsync" | "shipTarget" | "artifactsDir">,
  options: { buildId: string; target?: string; onProgress?: (message: string) => void },
): Promise<{ target: string; verified: number }> {
  assertBuildId(options.buildId);
  const targetText = options.target ?? config.shipTarget;
  if (!targetText) throw new Error("no ship target: pass --target user@host:/dir or set SHIP_TARGET");
  const target = parseShipTarget(targetText);
  const sourceDir = resolve(config.artifactsDir, options.buildId);
  const manifest = await readManifest(sourceDir);

  options.onProgress?.(`rsync ${sourceDir} -> ${targetText}`);
  await run(rsyncArgs({ rsync: config.rsync, sourceDir, target, buildId: options.buildId }));

  // rsync has just re-sent every file whose size or mtime differs, manifest.sha256 included, so
  // the server's checksum file is the one that was shipped with this dump.
  options.onProgress?.("verifying checksums on the target");
  if (target.host) {
    await run(remoteVerifyArgs({ rsync: config.rsync, host: target.host, dir: target.dir, buildId: options.buildId }));
  } else {
    await verifyChecksums(resolve(target.dir, options.buildId), manifest);
  }
  return { target: targetText, verified: manifest.files.length };
}
