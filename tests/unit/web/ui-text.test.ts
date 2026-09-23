import { describe, expect, it } from "vitest";
import { formatInt } from "../../../src/lib/format";
import { isFeminine } from "../../../src/lib/home-view";
import { UI } from "../../../src/lib/ui-text";

describe("UI.home.lead", () => {
  it("injects the count and keeps a preposition from ever trailing a line (em dash, NBSP after В/в/по)", () => {
    expect(UI.home.lead(formatInt(3303778))).toBe(
      `В базе — ${formatInt(3303778)} человек, репрессированных в СССР по политическим мотивам.`,
    );
  });
});

describe("UI.home.featured gendered forms", () => {
  // Mirrors FeaturedPerson.tsx's own `isFeminine(person.sex) ? ... : ...` selection, for a female
  // and a male row — a photo-bearing person's `sex` is "m", "f" or "unknown" (spec's masculine
  // default for the last).
  it("picks the feminine step label and \"Арестована\" for a female row", () => {
    const f = isFeminine("f");
    expect(f ? UI.home.featured.steps.bornF : UI.home.featured.steps.born).toBe("родилась");
    expect(f ? UI.home.featured.arrestedF("16.04.1938") : UI.home.featured.arrested("16.04.1938")).toBe("Арестована 16.04.1938.");
  });
  it("picks the masculine step label and \"Арестован\" for a male row, and for unknown sex alike", () => {
    for (const sex of ["m", "unknown"]) {
      const f = isFeminine(sex);
      expect(f ? UI.home.featured.steps.bornF : UI.home.featured.steps.born).toBe("родился");
      expect(f ? UI.home.featured.arrestedF("16.04.1938") : UI.home.featured.arrested("16.04.1938")).toBe("Арестован 16.04.1938.");
    }
  });
});

describe("UI.footer", () => {
  it("computes the copyright line from the given year, without repeating the site name", () => {
    expect(UI.footer.copyright(2026)).toBe("2026 ©");
  });

  it("no longer carries the copyright in madeWith, now moved to the footer's left column", () => {
    expect(UI.footer.madeWith).toBe("Made with");
  });

  it("keeps the source column's heading; the middle column's own heading was dropped (2026-09-18 review)", () => {
    expect(UI.footer.sourceHeading).toBe("Источник");
  });

  it("splits the source and licence lines into a plain label and the link's own text, so the label never sits inside the <a>", () => {
    expect(UI.footer.sourceLabel).toBe("Данные:");
    expect(UI.footer.sourceName).toBe("Открытый список");
    expect(UI.footer.licenceLabel).toBe("Лицензия:");
    expect(UI.footer.licence).toBe("CC BY-SA 4.0");
  });

  it("computes the data-date line from a readable date, with a fallback sentence for null", () => {
    expect(UI.footer.dataDate("15 сентября 2026")).toBe("Состояние данных: 15 сентября 2026");
    expect(UI.footer.dataDate(null)).toBe("Дата данных не указана");
  });

  it("has the left column's description line, with prepositions bound to the next word", () => {
    expect(UI.footer.description).toBe("База данных людей, репрессированных в СССР по политическим мотивам.");
  });
});

describe("UI.home title", () => {
  it("has no trailing full stops (2026-09-18 review)", () => {
    expect(UI.home.title).toBe("Найти имя");
    expect(UI.home.titleAccent).toBe("Понять масштаб");
  });
});

describe("UI.home stat labels", () => {
  it("keeps the persons label short, without repeating that this is the whole database (2026-09-18 review)", () => {
    expect(UI.home.persons).toBe("человек");
  });
});

describe("UI.home.story.geography", () => {
  it("leads with the dimension name, then the source-of-record explanation", () => {
    expect(UI.home.story.geography.text).toBe("Регион источника, из книги памяти которого пришла запись.");
  });

  it("titles the home page's map shorter than the \"Цифры\" page's own dimension name", () => {
    expect(UI.home.story.geography.map).toBe("Источник");
  });

  it("combines the boundaries and collapse caveats into one shorter sentence, its own string rather than the two footer ones glued together", () => {
    expect(UI.home.story.geography.note).toBe(
      "Границы регионов современные и лишь приблизительно соответствуют советским. Записи Московской и Ленинградской областей объединены с Москвой и Санкт-Петербургом.",
    );
  });

  it("has the unknown-region label to pair with the computed count", () => {
    expect(UI.home.story.geography.unknownLabel).toBe("Регион неизвестен");
  });
});

describe("UI.home.story.sentences.text", () => {
  it("joins the confirmed-executions sentence onto the first paragraph when the aggregate is present", () => {
    expect(UI.home.story.sentences.text(formatInt(322774))).toBe(
      `Расстрел, лагерь, ссылка и спецпоселение — три самых частых исхода. Из приговорённых к расстрелу казнь подтверждена для ${formatInt(322774)} человек.`,
    );
  });

  it('ends after "исхода." with no dangling text when the aggregate is missing', () => {
    expect(UI.home.story.sentences.text(null)).toBe("Расстрел, лагерь, ссылка и спецпоселение — три самых частых исхода.");
  });
});

describe("UI.home.story.sentences.sexText", () => {
  it("is the section's second paragraph", () => {
    expect(UI.home.story.sentences.sexText).toBe("Рядом — распределение по полу: женщин в базе чуть больше четверти.");
  });
});

describe("UI.home.story.terror.tailNote", () => {
  it("explains the home chart's trimmed tail without naming a year that would go stale, binding на to the next word with NBSP", () => {
    expect(UI.home.story.terror.tailNote).toBe(
      "График обрывается там, где аресты становятся единичными случаями: весь период — на странице «Цифры».",
    );
    expect(UI.home.story.terror.tailNote).not.toMatch(/\d{4}/);
  });
});
