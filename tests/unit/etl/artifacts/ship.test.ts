import { describe, expect, it } from "vitest";
import { parseShipTarget, remoteVerifyArgs, rsyncArgs, toWslPath } from "../../../../scripts/etl/artifacts/ship";

describe("parseShipTarget", () => {
  it("splits user@host:/dir and keeps local paths local", () => {
    expect(parseShipTarget("deploy@vps.example:/srv/memoru/artifacts")).toEqual({ host: "deploy@vps.example", dir: "/srv/memoru/artifacts" });
    expect(parseShipTarget("/tmp/artifacts")).toEqual({ host: null, dir: "/tmp/artifacts" });
    expect(parseShipTarget("D:\\tmp\\artifacts")).toEqual({ host: null, dir: "D:\\tmp\\artifacts" });
  });
});

describe("toWslPath", () => {
  it("translates a Windows path to /mnt", () => {
    expect(toWslPath("D:\\Work\\memoru\\.artifacts\\20260916")).toBe("/mnt/d/Work/memoru/.artifacts/20260916");
    expect(toWslPath("/already/posix")).toBe("/already/posix");
  });
});

describe("rsyncArgs", () => {
  it("builds a resumable remote transfer through wsl", () => {
    const args = rsyncArgs({
      rsync: ["wsl", "rsync"], sourceDir: "D:\\Work\\memoru\\.artifacts\\20260916",
      target: { host: "deploy@vps", dir: "/srv/memoru/artifacts" }, buildId: "20260916",
    });
    expect(args).toEqual([
      "wsl", "rsync", "-av", "--partial", "--progress", "--mkpath",
      "/mnt/d/Work/memoru/.artifacts/20260916/", "deploy@vps:/srv/memoru/artifacts/20260916/",
    ]);
    // --append-verify would skip a rebuilt artifact of the same size: the server would keep the old one.
    expect(args).not.toContain("--append-verify");
  });

  it("copies to a local directory without ssh", () => {
    const args = rsyncArgs({ rsync: ["rsync"], sourceDir: "/home/me/.artifacts/20260916", target: { host: null, dir: "/srv/local" }, buildId: "20260916" });
    expect(args.slice(-2)).toEqual(["/home/me/.artifacts/20260916/", "/srv/local/20260916/"]);
  });
});

describe("remoteVerifyArgs", () => {
  it("runs sha256sum -c in the shipped directory over ssh", () => {
    expect(remoteVerifyArgs({ rsync: ["wsl", "rsync"], host: "deploy@vps", dir: "/srv/memoru/artifacts", buildId: "20260916" })).toEqual([
      "wsl", "ssh", "deploy@vps", "cd '/srv/memoru/artifacts/20260916' && sha256sum -c manifest.sha256",
    ]);
    expect(remoteVerifyArgs({ rsync: ["rsync"], host: "deploy@vps", dir: "/srv", buildId: "x" })[0]).toBe("ssh");
  });
});
