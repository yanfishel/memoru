import { execFileSync, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, createReadStream, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readDumpPages, type DumpPage } from "../../../scripts/etl/dump/read-dump";
import { openDump } from "../../../scripts/etl/dump/open-dump";

// Records every child process openDump spawns, so a test can assert it was
// killed after an early consumer break. vi.mock is hoisted above all imports
// by Vitest, and vi.hoisted lets the factory below reach this array -- a
// plain vi.spyOn after the static `import { openDump }` above would be too
// late: open-dump.ts's own `import { spawn }` already resolved by then.
const { spawnedChildren } = vi.hoisted(() => ({ spawnedChildren: [] as ChildProcess[] }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const child = actual.spawn(...args);
      spawnedChildren.push(child);
      return child;
    },
  };
});

const FIXTURE = "tests/fixtures/mini-dump.xml";
// Matches config.ts's own default, so these tests exercise the binary name the
// pipeline actually spawns rather than depending on a name unique to the test.
const SEVEN_ZIP = process.env.SEVEN_ZIP_PATH ?? "7z";

// existsSync("7z") is always false for a bare PATH name (it's not a path), and
// vitest.config.ts does not load .env (only the integration config does), so a
// hardcoded absolute default here would silently skip these 5 tests on any
// machine without that exact path -- including a fresh clone, Linux, or CI --
// while `pnpm test` still reports all-green. Probe by actually spawning the
// binary instead, and warn loudly when that fails so a green run can't hide it.
const SEVEN_ZIP_AVAILABLE = spawnSync(SEVEN_ZIP, [], { stdio: "ignore" }).error === undefined;
if (!SEVEN_ZIP_AVAILABLE) {
  console.warn(
    `[read-dump.test] 7z not found at "${SEVEN_ZIP}" (set SEVEN_ZIP_PATH to override) -- ` +
      `skipping 5 openDump-with-7z tests`,
  );
}

async function collect(input: AsyncIterable<string | Uint8Array>): Promise<DumpPage[]> {
  const pages: DumpPage[] = [];
  for await (const page of readDumpPages(input)) pages.push(page);
  return pages;
}

describe("readDumpPages", () => {
  it("yields namespace-0 pages with their latest revision", async () => {
    const pages = await collect(createReadStream(FIXTURE));
    expect(pages.map((p) => p.pageId)).toEqual([101, 103, 104]);
    const first = pages[0];
    expect(first.title).toBe("Сафронов Илья Федорович (1892)");
    expect(first.revId).toBe(1002);
    expect(first.revTimestamp).toBe("2021-05-05T10:00:00Z");
    expect(first.text).toContain("|приговор 1=10 лет ИТЛ");
  });

  it("decodes XML entities", async () => {
    const pages = await collect(createReadStream(FIXTURE));
    expect(pages[2].text).toBe("A & B <list>");
  });

  it("handles multi-byte characters split across chunks", async () => {
    const bytes = readFileSync(FIXTURE);
    const cyrillicAt = bytes.indexOf(Buffer.from("Сафронов"));
    async function* chunks() {
      yield bytes.subarray(0, cyrillicAt + 1); // cuts the 2-byte "С" in half
      yield bytes.subarray(cyrillicAt + 1);
    }
    const pages = await collect(chunks());
    expect(pages[0].title).toBe("Сафронов Илья Федорович (1892)");
  });
});

describe("openDump", () => {
  it("streams a plain XML file", async () => {
    const pages = await collect(openDump("7z", FIXTURE));
    expect(pages).toHaveLength(3);
  });
});

describe("openDump with 7z", () => {
  it.skipIf(!SEVEN_ZIP_AVAILABLE)("streams pages out of a .7z archive", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    const dumpFile = join(dir, "single-history.xml");
    copyFileSync(FIXTURE, dumpFile);
    const archive = join(dir, "mini.xml.7z");
    execFileSync(SEVEN_ZIP, ["a", archive, dumpFile], { stdio: "ignore", cwd: dir });
    const pages = await collect(openDump(SEVEN_ZIP, archive));
    expect(pages.map((p) => p.pageId)).toEqual([101, 103, 104]);
  });

  it.skipIf(!SEVEN_ZIP_AVAILABLE)("surfaces a non-zero 7z exit as a stream error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    const archive = join(dir, "broken.7z");
    writeFileSync(archive, "not an archive");
    await expect(collect(openDump(SEVEN_ZIP, archive))).rejects.toThrow(/7z/);
  });

  it.skipIf(!SEVEN_ZIP_AVAILABLE)("picks the history entry out of a multi-file archive by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    writeFileSync(join(dir, "errors.log"), "junk log content, not XML");
    copyFileSync(FIXTURE, join(dir, "sample-history.xml"));
    const archive = join(dir, "dump.7z");
    execFileSync(SEVEN_ZIP, ["a", archive, "errors.log", "sample-history.xml"], { stdio: "ignore", cwd: dir });
    const pages = await collect(openDump(SEVEN_ZIP, archive));
    expect(pages.map((p) => p.pageId)).toEqual([101, 103, 104]);
  });

  it.skipIf(!SEVEN_ZIP_AVAILABLE)("picks an explicitly named entry out of a multi-file archive", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    writeFileSync(join(dir, "errors.log"), "junk log content, not XML");
    copyFileSync(FIXTURE, join(dir, "sample-history.xml"));
    const archive = join(dir, "dump.7z");
    execFileSync(SEVEN_ZIP, ["a", archive, "errors.log", "sample-history.xml"], { stdio: "ignore", cwd: dir });
    const pages = await collect(openDump(SEVEN_ZIP, archive, "sample-history.xml"));
    expect(pages.map((p) => p.pageId)).toEqual([101, 103, 104]);
  });

  // 7z exits 0 and writes zero bytes to stdout when the entry glob matches
  // nothing (verified by hand: `7z e -so archive.7z "*nomatch.xml"` -> exit
  // 0, empty stdout, empty stderr). openDump must distinguish that from "the
  // entry happened to be empty" and raise a clear error naming the archive
  // and the glob -- previously this surfaced one layer up, as saxes's
  // "document must contain a root element" from readDumpPages, which
  // mentions neither 7z, the dump path, nor the entry name.
  it.skipIf(!SEVEN_ZIP_AVAILABLE)("throws a clear error when the entry glob matches nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    copyFileSync(FIXTURE, join(dir, "sample-history.xml"));
    const archive = join(dir, "dump.7z");
    execFileSync(SEVEN_ZIP, ["a", archive, "sample-history.xml"], { stdio: "ignore", cwd: dir });
    await expect(collect(openDump(SEVEN_ZIP, archive, "*nomatch.xml"))).rejects.toThrow(
      /7z produced no data.*\*nomatch\.xml.*dump\.7z/,
    );
  });

  // Builds a synthetic dump with `count` minimal namespace-0 pages, each padded
  // to `padBytes` of text. openDump's 7z child writes decompressed bytes to an
  // OS pipe of limited size (tens of KB); with the mini-dump fixture alone (a
  // few KB) 7z finishes and exits on its own well before a 2-page break, so a
  // buggy "never kill the child" implementation would pass that test by
  // accident. A large-enough fixture makes 7z genuinely block on a full pipe
  // once the consumer stops reading, reproducing the real-archive hang
  // (`pnpm etl census --limit 5` stayed alive well past two minutes).
  function buildPaddedDumpXml(count: number, padBytes: number): string {
    const pad = "x".repeat(padBytes);
    const pages = Array.from(
      { length: count },
      (_, i) =>
        `<page><title>Page ${i}</title><ns>0</ns><id>${i + 1}</id>` +
        `<revision><id>${i + 1}</id><timestamp>2020-01-01T00:00:00Z</timestamp>` +
        `<text bytes="${padBytes}" xml:space="preserve">${pad}</text></revision></page>`,
    ).join("\n");
    return `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/" version="0.10" xml:lang="ru">${pages}</mediawiki>`;
  }

  // A `--limit`-style early `break` in a consumer (cli.ts) destroys the returned
  // stream before 7z has finished writing. Previously the child process was
  // never killed: `child.stdout` gets unpiped, nobody drains it, 7z blocks on
  // a full pipe, and the live child handle keeps the event loop alive forever
  // (reproduced: `pnpm etl census --limit 5` against the real archive stayed
  // alive well past two minutes).
  it.skipIf(!SEVEN_ZIP_AVAILABLE)("kills the 7z child when the consumer breaks early", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memoru-7z-"));
    const dumpFile = join(dir, "big-history.xml");
    // 200 pages x 20 KB of text = ~4 MB decompressed, comfortably past any OS
    // pipe buffer, so an unread PassThrough leaves 7z genuinely blocked on write().
    writeFileSync(dumpFile, buildPaddedDumpXml(200, 20_000), "utf8");
    const archive = join(dir, "big.xml.7z");
    execFileSync(SEVEN_ZIP, ["a", archive, dumpFile], { stdio: "ignore", cwd: dir });

    const before = spawnedChildren.length;
    let count = 0;
    for await (const page of readDumpPages(openDump(SEVEN_ZIP, archive))) {
      void page;
      count++;
      if (count >= 2) break;
    }
    expect(count).toBe(2);
    expect(spawnedChildren).toHaveLength(before + 1);
    const child = spawnedChildren[before];
    // The child must be killed (or already have exited) promptly, not left
    // running past the break -- poll briefly instead of asserting instantly,
    // since kill() is asynchronous.
    const deadline = Date.now() + 2000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
