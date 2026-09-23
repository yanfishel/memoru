import { describe, expect, it } from "vitest";
import { narrative } from "../../../src/lib/person-view";
import { shareLinks, shareText } from "../../../src/lib/share-links";
import { firstCase, labels, person } from "./fixtures/person";

describe("shareLinks", () => {
  it("builds the seven service links with the URL and text percent-encoded", () => {
    const links = shareLinks("https://example.org/person/7-иванов", "Иванов Иван. Родился в 1900 году.");
    expect(links.map((l) => l.key)).toEqual(["telegram", "whatsapp", "vk", "ok", "x", "facebook", "email"]);
    const by = Object.fromEntries(links.map((l) => [l.key, l.href]));
    expect(by.telegram).toBe("https://t.me/share/url?url=https%3A%2F%2Fexample.org%2Fperson%2F7-%D0%B8%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2&text=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%20%D0%98%D0%B2%D0%B0%D0%BD.%20%D0%A0%D0%BE%D0%B4%D0%B8%D0%BB%D1%81%D1%8F%20%D0%B2%201900%20%D0%B3%D0%BE%D0%B4%D1%83.");
    expect(by.whatsapp.startsWith("https://wa.me/?text=")).toBe(true);
    expect(by.vk.startsWith("https://vk.com/share.php?url=")).toBe(true);
    expect(by.ok.startsWith("https://connect.ok.ru/offer?url=")).toBe(true);
    expect(by.x.startsWith("https://twitter.com/intent/tweet?url=")).toBe(true);
    expect(by.facebook).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.org%2Fperson%2F7-%D0%B8%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2");
    expect(by.email.startsWith("mailto:?subject=")).toBe(true);
    for (const link of links) expect(link.href).not.toContain(" ");
  });
  it("makes the share text from the name and the first narrative sentence", () => {
    expect(shareText("Иванов Иван", "Родился в 1900 году. Арестован 10.08.1930.")).toBe("Иванов Иван. Родился в 1900 году.");
    expect(shareText("Иванов Иван", "")).toBe("Иванов Иван");
  });
  it("never cuts inside a place abbreviation", () => {
    expect(shareText("Иванов Иван", "Родился 01.02.1900, место рождения — г. Москва. Проживал — г. Москва.")).toBe(
      "Иванов Иван. Родился 01.02.1900, место рождения — г. Москва.",
    );
    expect(shareText("Сафронов Илья Федорович", narrative(person, [firstCase], labels))).toBe(
      "Сафронов Илья Федорович. Родился в 1892 году, место рождения — ЧО, Троицкий р-н, п. Ключевка.",
    );
  });
  it("skips the leading case number of a multi-case narrative", () => {
    const second = { ...firstCase, n: 2 };
    const bare = { ...person, birthYear: null, birthPlaceRaw: null, residenceRaw: null, nationalityRaw: null, educationRaw: null, partyRaw: null };
    expect(shareText("Сафронов Илья Федорович", narrative(bare, [firstCase, second], labels))).toBe(
      "Сафронов Илья Федорович. Арестован 27.03.1938.",
    );
  });
  it("falls back to the whole text, hard-cut, when no sentence boundary is trusted", () => {
    expect(shareText("Иванов Иван", "Приговор — 5 лет.")).toBe("Иванов Иван. Приговор — 5 лет.");
    expect(shareText("Иванов Иван", `Место рождения — ${"с. ".repeat(100)}Ы.`)).toHaveLength("Иванов Иван. ".length + 200);
  });
});
