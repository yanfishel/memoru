import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Settings } from "meilisearch";
import type { CoverageReport } from "../check";

export const MANIFEST_FILE = "manifest.json";
export const CHECKSUM_FILE = "manifest.sha256";

export interface ManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  version: 1;
  buildId: string;
  schema: string;
  index: string;
  createdAt: string;
  dataDate: string | null;
  persons: number;
  cases: number;
  documents: number;
  settings: Settings;
  coverage: CoverageReport | null;
  files: ManifestFile[];
}

export const dumpFileName = (buildId: string) => `serving_${buildId}.dump`;
export const documentsFileName = (buildId: string) => `people_${buildId}.jsonl.gz`;

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export async function describeFile(dir: string, name: string): Promise<ManifestFile> {
  const path = join(dir, name);
  return { name, bytes: (await stat(path)).size, sha256: await sha256File(path) };
}

/** `sha256sum -c` format: two spaces between the hash and the name. */
export function renderChecksums(files: ManifestFile[]): string {
  return files.map((f) => `${f.sha256}  ${f.name}\n`).join("");
}

export async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  await writeFile(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(join(dir, CHECKSUM_FILE), renderChecksums(manifest.files), "utf8");
}

const REQUIRED: (keyof Manifest)[] = ["buildId", "schema", "index", "createdAt", "persons", "cases", "documents", "settings", "files"];

export async function readManifest(dir: string): Promise<Manifest> {
  const json: unknown = JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8"));
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`manifest in ${dir} is not a JSON object`);
  }
  const parsed = json as Partial<Manifest>;
  if (parsed.version !== 1) throw new Error(`manifest version ${String(parsed.version)} is not supported (expected 1)`);
  for (const key of REQUIRED) {
    if (parsed[key] === undefined) throw new Error(`manifest is missing "${key}"`);
  }
  return parsed as Manifest;
}

export async function verifyChecksums(dir: string, manifest: Manifest): Promise<void> {
  for (const file of manifest.files) {
    const actual = await describeFile(dir, file.name);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
      throw new Error(`checksum mismatch for ${file.name}: expected ${file.sha256} (${file.bytes} bytes), got ${actual.sha256} (${actual.bytes} bytes)`);
    }
  }
}
