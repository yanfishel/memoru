import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { PassThrough, type Readable } from "node:stream";

/**
 * Opens a dump as a byte stream: plain files directly, .7z archives through
 * `7z e -so`, extracting only `entry` (a 7z-compatible glob) since a dump
 * archive may bundle multiple files (logs, titles, siteinfo, etc.) alongside
 * the history XML.
 */
export function openDump(sevenZipPath: string, dumpPath: string, entry = "*history.xml"): Readable {
  if (!dumpPath.toLowerCase().endsWith(".7z")) {
    return createReadStream(dumpPath);
  }
  const child = spawn(sevenZipPath, ["e", "-so", dumpPath, entry], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Pipe through a stream we control: `child.stdout` typically ends (and
  // autoDestroys) as soon as the process's stdio closes, before the
  // 'close' event fires with the exit code, so destroying `child.stdout`
  // there would be a no-op. Ending `out` ourselves lets us fail it after
  // the child's output has already ended.
  const out = new PassThrough();
  child.stdout.pipe(out, { end: false });
  let stderr = "";
  // `.pipe()` above already switches child.stdout into flowing mode, so this
  // adds no new flow-control side effect; counting on `out` instead risks
  // starting `out` flowing before the real consumer (readDumpPages) attaches
  // its own listener, which could drop chunks emitted in that gap.
  let bytesOut = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    bytesOut += chunk.length;
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });
  child.on("error", (err) => out.destroy(err));
  child.on("close", (code, signal) => {
    if (code === 0) {
      if (bytesOut === 0) {
        // 7z exits 0 with zero bytes on stdout when `entry` matches nothing in
        // the archive (verified by hand: `7z e -so archive.7z "*nomatch.xml"`
        // -> exit 0, empty stdout, empty stderr). Left alone, an empty byte
        // stream never gives the downstream XML parser a root element, and the
        // resulting error names neither 7z, the archive, nor the entry glob.
        out.destroy(new Error(`7z produced no data: no entry matching "${entry}" in ${dumpPath}`));
      } else {
        out.end();
      }
    } else {
      const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`;
      out.destroy(new Error(`7z ${reason}: ${stderr.trim()}`));
    }
  });
  // If the consumer stops reading early (e.g. a `--limit`-style break), Node's
  // Readable async-iterator protocol destroys `out` for us, but `out` closing
  // does not by itself stop the child: `child.stdout` is left unpiped with
  // nobody draining it, so 7z blocks on a full pipe and the live child handle
  // keeps the event loop alive indefinitely. Kill it once `out` is done with,
  // for any reason (normal end, error, or early destroy). Closing our end of the pipe comes first:
  // on Linux 7-Zip traps SIGTERM and only sets a break flag it never checks while blocked in write(),
  // whereas a closed pipe fails that write with EPIPE and 7z exits on every platform.
  out.on("close", () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.stdout.destroy();
      child.kill();
    }
  });
  return out;
}
