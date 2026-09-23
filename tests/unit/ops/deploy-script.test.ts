import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "../../../docker/deploy.sh");
const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
const BASH = process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash";
const REPO = "ghcr.io/example/memoru";

// A docker stand-in: logs its arguments, fails `pull` on request, answers the health probe with
// STUB_HEALTH while .env points at STUB_BAD_IMAGE (200 otherwise), and lists STUB_IMAGES.
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$1" in
  pull) [ -n "\${STUB_PULL_FAIL:-}" ] && exit 1; exit 0 ;;
  images) printf '%s\\n' $STUB_IMAGES; exit 0 ;;
  rmi) exit 0 ;;
  compose)
    if [[ "$*" == *" exec "* ]]; then
      if grep -q "MEMORU_IMAGE=\${STUB_BAD_IMAGE:-none}" "$DEPLOY_DIR/.env"; then printf '%s' "\${STUB_HEALTH:-200}"; else printf '200'; fi
    fi
    exit 0 ;;
esac
exit 0
`;

function setup(env: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), STUB);
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(path.join(dir, ".env"), env);
  return { dir, bin, log: path.join(dir, "docker.log") };
}

function run(tag: string, extra: Record<string, string> = {}, env = `SITE_URL=https://example.org\r\nMEMORU_IMAGE=${REPO}:v0.9.0\r\nOTHER=x\r\n`) {
  const { dir, bin, log } = setup(env);
  const toPosix = (p: string) => p.replace(/\\/g, "/");
  const result = spawnSync(BASH, [toPosix(SCRIPT)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      SSH_ORIGINAL_COMMAND: tag,
      DEPLOY_DIR: toPosix(dir),
      DEPLOY_IMAGE_REPO: REPO,
      DEPLOY_HEALTH_TIMEOUT: "2",
      DEPLOY_HEALTH_INTERVAL: "0.2",
      STUB_LOG: toPosix(log),
      STUB_IMAGES: `${REPO}:v0.8.0 ${REPO}:v0.9.0 ${REPO}:v1.0.0 ${REPO}:latest`,
      ...extra,
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  return { status: result.status, stderr: result.stderr, calls, envFile: readFileSync(path.join(dir, ".env"), "utf8") };
}

describe("docker/deploy.sh", () => {
  it.each(["", "latest", "v1.0", "1.0.0", "v1.0.0; rm -rf /", "v1.0.0\nls", "v1.0.0 extra"])("refuses the tag %j before any docker call", (tag) => {
    const r = run(tag);
    expect(r.status).toBe(2);
    expect(r.calls).toEqual([]);
  });

  it("changes nothing when the image cannot be pulled", () => {
    const r = run("v1.0.0", { STUB_PULL_FAIL: "1" });
    expect(r.status).toBe(3);
    expect(r.envFile).toContain(`MEMORU_IMAGE=${REPO}:v0.9.0`);
    expect(r.calls.some((c) => c.includes(" up "))).toBe(false);
  });

  it("switches the image, restarts web and prunes all but the new and previous images", () => {
    const r = run("v1.0.0");
    expect(r.status).toBe(0);
    expect(r.envFile).toMatch(new RegExp(`^MEMORU_IMAGE=${REPO}:v1\\.0\\.0$`, "m"));
    expect(r.envFile).toContain("SITE_URL=https://example.org\r\n");
    expect(r.calls).toContain(`pull ${REPO}:v1.0.0`);
    expect(r.calls.filter((c) => c.endsWith("up -d web"))).toHaveLength(1);
    const removed = r.calls.filter((c) => c.startsWith("rmi ")).map((c) => c.slice(4));
    expect(removed.sort()).toEqual([`${REPO}:latest`, `${REPO}:v0.8.0`]);
  });

  it("restores the previous image when the new one never answers 200", () => {
    const r = run("v1.0.0", { STUB_BAD_IMAGE: `${REPO}:v1.0.0`, STUB_HEALTH: "503" });
    expect(r.status).toBe(1);
    expect(r.envFile).toMatch(new RegExp(`^MEMORU_IMAGE=${REPO}:v0\\.9\\.0$`, "m"));
    expect(r.calls.filter((c) => c.endsWith("up -d web"))).toHaveLength(2);
    expect(r.calls.some((c) => c.startsWith("rmi "))).toBe(false);
    expect(r.stderr).toContain("restoring");
  });

  it("removes nothing when redeploying the running tag, so the older fallback image survives", () => {
    const r = run("v1.0.0", {}, `MEMORU_IMAGE=${REPO}:v1.0.0\r\n`);
    expect(r.status).toBe(0);
    expect(r.calls.some((c) => c.startsWith("rmi "))).toBe(false);
  });

  it("appends MEMORU_IMAGE when .env has none", () => {
    const r = run("v1.0.0", {}, "SITE_URL=https://example.org\n");
    expect(r.status).toBe(0);
    expect(r.envFile).toMatch(new RegExp(`^MEMORU_IMAGE=${REPO}:v1\\.0\\.0$`, "m"));
  });
});
