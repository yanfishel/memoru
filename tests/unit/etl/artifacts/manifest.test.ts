import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CHECKSUM_FILE, MANIFEST_FILE, documentsFileName, dumpFileName, readManifest, renderChecksums, sha256File, verifyChecksums, writeManifest,
  type Manifest,
} from "../../../../scripts/etl/artifacts/manifest";

const dir = mkdtempSync(join(tmpdir(), "memoru-manifest-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("manifest", () => {
  it("names the files after the build id", () => {
    expect(dumpFileName("20260916")).toBe("serving_20260916.dump");
    expect(documentsFileName("20260916")).toBe("people_20260916.jsonl.gz");
  });

  it("hashes files and renders sha256sum lines", async () => {
    writeFileSync(join(dir, "a.bin"), "hello");
    const hash = await sha256File(join(dir, "a.bin"));
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(renderChecksums([{ name: "a.bin", bytes: 5, sha256: hash }])).toBe(`${hash}  a.bin\n`);
  });

  it("writes, reads and verifies a manifest, and names a corrupted file", async () => {
    const manifest: Manifest = {
      version: 1, buildId: "20260916", schema: "serving_20260916", index: "people_20260916", createdAt: "2026-09-16T00:00:00Z",
      dataDate: "2026-09-16", persons: 1, cases: 1, documents: 1, settings: {}, coverage: null,
      files: [{ name: "a.bin", bytes: 5, sha256: await sha256File(join(dir, "a.bin")) }],
    };
    await writeManifest(dir, manifest);
    expect(await readManifest(dir)).toEqual(manifest);
    await expect(verifyChecksums(dir, manifest)).resolves.toBeUndefined();
    writeFileSync(join(dir, "a.bin"), "hellp");
    await expect(verifyChecksums(dir, manifest)).rejects.toThrow(/a\.bin/);
    expect(MANIFEST_FILE).toBe("manifest.json");
    expect(CHECKSUM_FILE).toBe("manifest.sha256");
  });

  it("rejects a manifest with the wrong version", async () => {
    writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify({ version: 2 }));
    await expect(readManifest(dir)).rejects.toThrow(/version/);
  });

  it("rejects JSON that is not an object", async () => {
    for (const json of ["null", "[]", '"manifest"', "42"]) {
      writeFileSync(join(dir, MANIFEST_FILE), json);
      await expect(readManifest(dir)).rejects.toThrow(/manifest .* is not a JSON object/);
    }
  });
});
