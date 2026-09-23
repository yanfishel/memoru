import { describe, expect, it } from "vitest";
import { photoUrl } from "../../../src/lib/person-photo";

describe("photoUrl", () => {
  it("builds the MediaWiki storage path from the md5 hash of the underscored name", () => {
    expect(photoUrl("Абиссов_Александр_Афанасьевич_(1873).jpg")).toBe(
      "https://ru.openlist.wiki/images/0/0c/%D0%90%D0%B1%D0%B8%D1%81%D1%81%D0%BE%D0%B2_%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%90%D1%84%D0%B0%D0%BD%D0%B0%D1%81%D1%8C%D0%B5%D0%B2%D0%B8%D1%87_(1873).jpg",
    );
  });
  it("replaces spaces with underscores before hashing and encoding", () => {
    expect(photoUrl("Абрамович Дмитрий Иванович-1.jpg")).toBe(
      "https://ru.openlist.wiki/images/1/1f/%D0%90%D0%B1%D1%80%D0%B0%D0%BC%D0%BE%D0%B2%D0%B8%D1%87_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B9_%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%87-1.jpg",
    );
  });
  it("uppercases a lowercase first character before hashing, like MediaWiki titles (82 stored names, 2026-09-17 review)", () => {
    expect(photoUrl("абрамович Дмитрий Иванович-1.jpg")).toBe(
      "https://ru.openlist.wiki/images/1/1f/%D0%90%D0%B1%D1%80%D0%B0%D0%BC%D0%BE%D0%B2%D0%B8%D1%87_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B9_%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%87-1.jpg",
    );
  });
  it("collapses a run of two or more spaces/underscores to one underscore before hashing (52 stored names, 2026-09-17 review)", () => {
    expect(photoUrl("Абрамович  Дмитрий   Иванович-1.jpg")).toBe(
      "https://ru.openlist.wiki/images/1/1f/%D0%90%D0%B1%D1%80%D0%B0%D0%BC%D0%BE%D0%B2%D0%B8%D1%87_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B9_%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%87-1.jpg",
    );
    expect(photoUrl("Абрамович__Дмитрий_ Иванович-1.jpg")).toBe(
      "https://ru.openlist.wiki/images/1/1f/%D0%90%D0%B1%D1%80%D0%B0%D0%BC%D0%BE%D0%B2%D0%B8%D1%87_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B9_%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%87-1.jpg",
    );
  });
});
