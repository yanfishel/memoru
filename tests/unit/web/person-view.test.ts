import { describe, expect, it } from "vitest";
import type { CaseRecord, PersonRecord } from "../../../src/db/schema";
import {
  badgesFor, caseRows, formatDate, formatDateLong, formatTerm, fullName, isoDate, labelOf, lifeYears, metaDescription, narrative, narrativeParagraphs,
  openlistUrl, personJsonLd, personRows, sourceSegments, timelineFor, truncateAtSentence,
} from "../../../src/lib/person-view";
import { firstCase, labels, person } from "./fixtures/person";

describe("dates", () => {
  it("formats by precision", () => {
    expect(formatDate({ year: 1938, month: 4, day: 16, precision: "f" })).toBe("16.04.1938");
    expect(formatDate({ year: 1937, month: 9, day: null, precision: "m" })).toBe("сентябрь 1937");
    expect(formatDate({ year: 1903, month: null, day: null, precision: "y" })).toBe("1903");
    expect(formatDate({ year: null, month: null, day: null, precision: null })).toBeNull();
  });
  it("renders ISO 8601 with the known precision", () => {
    expect(isoDate({ year: 1938, month: 4, day: 16, precision: "f" })).toBe("1938-04-16");
    expect(isoDate({ year: 1937, month: 9, day: null, precision: "m" })).toBe("1937-09");
    expect(isoDate({ year: 1903, month: null, day: null, precision: "y" })).toBe("1903");
  });
});

describe("formatDateLong", () => {
  it("renders an ISO date in readable Russian prose (footer's data-date line)", () => {
    expect(formatDateLong("2026-09-15")).toBe("15 сентября 2026");
  });
  it("does not zero-pad a single-digit day", () => {
    expect(formatDateLong("2026-09-05")).toBe("5 сентября 2026");
  });
  it("falls back to null for malformed or missing input, so UI.footer.dataDate shows its own fallback wording", () => {
    expect(formatDateLong("not-a-date")).toBeNull();
    expect(formatDateLong("2026-13-40")).toBeNull();
    expect(formatDateLong(null)).toBeNull();
  });
});

describe("names, links and labels", () => {
  it("joins the name parts and builds the Open List link", () => {
    expect(fullName(person)).toBe("Сафронов Илья Федорович");
    expect(fullName({ surname: "Иванов", givenName: null, patronymic: null })).toBe("Иванов");
    expect(openlistUrl("Сафронов Илья Федорович (1892)")).toBe(
      "https://ru.openlist.wiki/%D0%A1%D0%B0%D1%84%D1%80%D0%BE%D0%BD%D0%BE%D0%B2_%D0%98%D0%BB%D1%8C%D1%8F_%D0%A4%D0%B5%D0%B4%D0%BE%D1%80%D0%BE%D0%B2%D0%B8%D1%87_(1892)",
    );
  });
  it("labels codes and keeps unknown and unrecognized visible", () => {
    expect(labelOf(labels, "nationality", "russian")).toBe("русские");
    expect(labelOf(labels, "nationality", "unknown")).toBe("не указано");
    expect(labelOf(labels, "nationality", "unrecognized")).toBe("не распознано");
    expect(labelOf(labels, "nationality", "martian")).toBe("martian");
  });
  it("formats sentence terms", () => {
    expect(formatTerm(10, null)).toBe("10 лет");
    expect(formatTerm(1, 6)).toBe("1 год 6 месяцев");
    expect(formatTerm(null, 3)).toBe("3 месяца");
    expect(formatTerm(null, null)).toBeNull();
  });
});

describe("sourceSegments", () => {
  it("turns wiki markup into text and links", () => {
    expect(sourceSegments('БД "Жертвы"; [[Участник:ArchScolopendra]]; [http://martyrs.pstbi.ru/x БД «Новомученики»]')).toEqual([
      { text: 'БД "Жертвы"; ' },
      { text: "ArchScolopendra" },
      { text: "; " },
      { text: "БД «Новомученики»", href: "http://martyrs.pstbi.ru/x" },
    ]);
  });
  it("handles piped internal links, bare external links and the misplaced double-bracket form", () => {
    expect(sourceSegments("[[Справка:Белбалтлаг|ББК]]")).toEqual([{ text: "ББК" }]);
    expect(sourceSegments("[http://visz.nlr.ru]")).toEqual([{ text: "http://visz.nlr.ru", href: "http://visz.nlr.ru" }]);
    expect(sourceSegments("[[http://visz.nlr.ru/person/ Ленинградский мартиролог: 1937-1938]]")).toEqual([
      { text: "Ленинградский мартиролог: 1937-1938", href: "http://visz.nlr.ru/person/" },
    ]);
    expect(sourceSegments("Книга памяти")).toEqual([{ text: "Книга памяти" }]);
  });
  it("parses a photo caption's external link the same way (reused for photo captions, no second parser)", () => {
    expect(sourceSegments("Фотография из коллекции фотодокументов [http://www.sinodik.ru/ Мемориального научно-просветительского центра «Бутово»]")).toEqual([
      { text: "Фотография из коллекции фотодокументов " },
      { text: "Мемориального научно-просветительского центра «Бутово»", href: "http://www.sinodik.ru/" },
    ]);
  });
});

describe("rows", () => {
  it("shows the source's own words, without the dictionary bucket beside them", () => {
    const rows = personRows(person, labels);
    expect(rows.find((r) => r.term === "Национальность")).toEqual({ term: "Национальность", value: "русский", note: null });
    expect(rows.find((r) => r.term === "Образование")).toEqual({ term: "Образование", value: "грамотный", note: null });
    expect(rows.find((r) => r.term === "Партийность")).toEqual({ term: "Партийность", value: "б/п", note: null });
  });

  it("does not put a woman's nationality in the dictionary's plural form", () => {
    const rows = personRows({ ...woman, nationalityRaw: "финка", nationalityCode: "finnish" }, labels);
    expect(rows.find((r) => r.term === "Национальность")).toEqual({ term: "Национальность", value: "финка", note: null });
  });

  it("keeps the normalised geography, which names a place the raw value does not", () => {
    const rows = personRows(person, labels);
    expect(rows.find((r) => r.term === "Место рождения")).toEqual({
      term: "Место рождения", value: "ЧО, Троицкий р-н, п. Ключевка", note: "Челябинская область, Россия",
    });
  });

  it("falls back to the dictionary label only where the source states nothing", () => {
    const rows = personRows({ ...person, nationalityRaw: null }, labels);
    expect(rows.find((r) => r.term === "Национальность")).toEqual({ term: "Национальность", value: "русские", note: null });
    expect(rows.find((r) => r.term === "Регион источника")).toEqual({ term: "Регион источника", value: "Челябинская область", note: null });
  });

  it("states the sex and the fate as this person's own, in their gender", () => {
    const sexOf = (p: PersonRecord) => personRows(p, labels).find((r) => r.term === "Пол");
    const fateOf = (p: PersonRecord) => personRows(p, labels).find((r) => r.term === "Судьба");
    expect(sexOf(person)).toEqual({ term: "Пол", value: "мужской", note: null });
    expect(sexOf(woman)).toEqual({ term: "Пол", value: "женский", note: null });
    expect(sexOf({ ...person, sex: "unknown" })).toEqual({ term: "Пол", value: "не указан", note: null });
    expect(fateOf(executed)).toEqual({ term: "Судьба", value: "расстрелян, 17.11.1938", note: null });
    expect(fateOf({ ...executed, sex: "f" })).toEqual({ term: "Судьба", value: "расстреляна, 17.11.1938", note: null });
    expect(fateOf(person)).toEqual({ term: "Судьба", value: "не указана", note: null });
  });

  it("leaves the rest of a person's rows alone", () => {
    const rows = personRows(person, labels);
    expect(rows.find((r) => r.term === "Возраст на момент смерти")).toEqual({ term: "Возраст на момент смерти", value: null, note: null });
  });

  it("lays out a case", () => {
    const rows = caseRows(firstCase, labels);
    expect(rows.map((r) => r.term)).toEqual([
      "Дата ареста", "Осуждение", "Осудивший орган", "Статья", "Приговор", "Дата реабилитации", "Реабилитирующий орган",
    ]);
    expect(rows[0]).toEqual({ term: "Дата ареста", value: "27.03.1938", note: null });
    expect(rows[4]).toEqual({ term: "Приговор", value: "10 лет ИТЛ", note: null });
  });

  it("does not repeat a sentence type the source already spells out", () => {
    const rows = caseRows({ ...firstCase, sentenceRaw: "ВМН (расстрел)", sentenceType: "vmn", sentenceYears: null, sentenceMonths: null }, labels);
    expect(rows.find((r) => r.term === "Приговор")).toEqual({ term: "Приговор", value: "ВМН (расстрел)", note: null });
  });

  it("gives the sentence's type and term when the source states no sentence of its own", () => {
    const stated = caseRows(
      { ...firstCase, sentenceRaw: "10 лет ИТЛ", sentenceType: "unknown", sentenceYears: null, sentenceMonths: null },
      labels,
    );
    expect(stated.find((r) => r.term === "Приговор")).toEqual({ term: "Приговор", value: "10 лет ИТЛ", note: null });
    const typed = caseRows({ ...firstCase, sentenceRaw: null }, labels);
    expect(typed.find((r) => r.term === "Приговор")).toEqual({ term: "Приговор", value: "лагерь, 10 лет", note: null });
    const unstated = caseRows(
      { ...firstCase, sentenceRaw: null, sentenceType: "unknown", sentenceYears: null, sentenceMonths: null },
      labels,
    );
    expect(unstated.find((r) => r.term === "Приговор")).toEqual({ term: "Приговор", value: "не указано", note: null });
  });
});

describe("personJsonLd", () => {
  it("builds a schema.org Person", () => {
    expect(personJsonLd(person, "https://example.org/person/101-x")).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Сафронов Илья Федорович",
      familyName: "Сафронов",
      givenName: "Илья",
      additionalName: "Федорович",
      birthDate: "1892",
      birthPlace: { "@type": "Place", name: "ЧО, Троицкий р-н, п. Ключевка" },
      gender: "Male",
      url: "https://example.org/person/101-x",
      sameAs: openlistUrl(person.openlistTitle),
    });
  });
});

const executed: PersonRecord = { ...person, id: 102, deathKind: "executed", deathYear: 1938, deathMonth: 11, deathDay: 17, deathDatePrecision: "f", rehabilitated: false };
const woman: PersonRecord = { ...person, id: 103, sex: "f", givenName: "Анна", patronymic: "Ивановна" };
const bare: PersonRecord = {
  ...person, id: 104, birthYear: null, birthDatePrecision: null, birthPlaceRaw: null, residenceRaw: null, nationalityRaw: null, nationalityCode: "unknown",
  educationRaw: null, educationCode: "unknown", partyRaw: null, partyCode: "unknown", deathKind: "unknown", rehabilitated: false,
};
const bareCase: CaseRecord = {
  personId: 104, n: 1, arrestYear: 1930, arrestMonth: 8, arrestDay: 10, arrestDatePrecision: "f",
  convictionYear: null, convictionMonth: null, convictionDay: null, convictionDatePrecision: null,
  courtRaw: null, articleRaw: null, sentenceRaw: null, sentenceType: "unknown", sentenceYears: null, sentenceMonths: null,
  rehabYear: null, rehabMonth: null, rehabDay: null, rehabDatePrecision: null, rehabBodyRaw: null,
};

describe("narrative", () => {
  it("tells the full story in the source's own words, places verbatim", () => {
    expect(narrative(person, [firstCase], labels)).toBe(
      "Родился в 1892 году, место рождения — ЧО, Троицкий р-н, п. Ключевка. Проживал — ЧО, Троицкий р-н, п. Ключевка. " +
      "Национальность — русский, образование — грамотный, партийность — б/п. " +
      "Арестован 27.03.1938. Осуждён 14.11.1938, осудивший орган — Особ. тройка УНКВД ЧО, статья — 58-6-9-11. Приговор — 10 лет ИТЛ (лагерь). " +
      "Реабилитирован 21.10.1960 (Военный трибунал Уральского военного округа).",
    );
  });

  it("uses feminine forms for a woman and masculine forms when the sex is unknown", () => {
    expect(narrative(woman, [firstCase], labels)).toContain("Родилась в 1892 году");
    expect(narrative(woman, [firstCase], labels)).toContain("Арестована 27.03.1938");
    expect(narrative(woman, [firstCase], labels)).toContain("Реабилитирована 21.10.1960");
    expect(narrative({ ...person, sex: "unknown" }, [firstCase], labels)).toContain("Родился в 1892 году");
  });

  it("explains only what the source's own wording leaves unsaid", () => {
    const spelled = { ...firstCase, sentenceRaw: "ВМН (расстрел)", sentenceType: "vmn", sentenceYears: null, sentenceMonths: null };
    expect(narrative(person, [spelled], labels)).toContain("Приговор — ВМН (расстрел). ");
    expect(narrative(person, [{ ...firstCase, sentenceRaw: "ИТЛ" }], labels)).toContain("Приговор — ИТЛ (лагерь, 10 лет).");
  });

  it("folds missing fields into one sentence per group and never drops them", () => {
    expect(narrative(bare, [bareCase], labels)).toBe(
      "Арестован 10.08.1930. Осудивший орган, статья и приговор в источнике не указаны. Сведений о реабилитации нет.",
    );
    expect(narrative({ ...bare, sex: "f" }, [{ ...bareCase, courtRaw: "тройка" }], labels)).toContain(
      "Арестована 10.08.1930. Осудивший орган — тройка. Статья и приговор в источнике не указаны.",
    );
    expect(narrative(bare, [{ ...bareCase, sentenceRaw: "5 лет" }], labels)).toContain("Приговор — 5 лет. Осудивший орган и статья в источнике не указаны.");
    expect(narrative(bare, [{ ...bareCase, sentenceRaw: "5 лет", courtRaw: "ОСО" }], labels)).toContain("Статья в источнике не указана.");
  });

  it("closes with the rehabilitation, after the fate", () => {
    expect(narrative(executed, [firstCase], labels)).toBe(
      "Родился в 1892 году, место рождения — ЧО, Троицкий р-н, п. Ключевка. Проживал — ЧО, Троицкий р-н, п. Ключевка. " +
      "Национальность — русский, образование — грамотный, партийность — б/п. " +
      "Арестован 27.03.1938. Осуждён 14.11.1938, осудивший орган — Особ. тройка УНКВД ЧО, статья — 58-6-9-11. Приговор — 10 лет ИТЛ (лагерь). " +
      "Расстрелян 17.11.1938. Реабилитирован 21.10.1960 (Военный трибунал Уральского военного округа).",
    );
  });

  it("states the rehabilitation of every case, by number, when there are several", () => {
    const second: CaseRecord = {
      ...bareCase, n: 2, arrestYear: 1949, arrestMonth: null, arrestDay: null, arrestDatePrecision: "y",
      rehabYear: 1957, rehabMonth: 5, rehabDay: 12, rehabDatePrecision: "f",
    };
    expect(narrative(bare, [bareCase, second], labels)).toBe(
      "Дело 1. Арестован 10.08.1930. Осудивший орган, статья и приговор в источнике не указаны. " +
      "Дело 2. Арестован в 1949 году. Осудивший орган, статья и приговор в источнике не указаны. " +
      "По делу 2 реабилитирован 12.05.1957. Сведений о реабилитации по делу 1 нет.",
    );
  });

  it("folds the cases without rehabilitation into one sentence", () => {
    const at = (n: number, rehab: Partial<CaseRecord>): CaseRecord => ({ ...bareCase, n, ...rehab });
    const tail = (text: string) => text.slice(text.lastIndexOf("не указаны.") + "не указаны. ".length);
    expect(tail(narrative(bare, [at(1, {}), at(2, {}), at(3, {})], labels))).toBe("Сведений о реабилитации нет.");
    const may1957 = { rehabYear: 1957, rehabMonth: 5, rehabDay: null, rehabDatePrecision: "m" };
    expect(tail(narrative({ ...bare, sex: "f" }, [at(1, {}), at(2, may1957), at(3, {})], labels))).toBe(
      "По делу 2 реабилитирована в мае 1957 года. Сведений о реабилитации по делам 1 и 3 нет.",
    );
    expect(tail(narrative(bare, [at(1, {}), at(2, {}), at(3, { rehabBodyRaw: "ВК ВС СССР." }), at(4, {})], labels))).toBe(
      "По делу 3 реабилитирован (ВК ВС СССР). Сведений о реабилитации по делам 1, 2 и 4 нет.",
    );
    expect(tail(narrative({ ...bare, sex: "f" }, [at(1, { rehabYear: 1956, rehabDatePrecision: "y" }), at(2, may1957)], labels))).toBe(
      "По делу 1 реабилитирована в 1956 году. По делу 2 реабилитирована в мае 1957 года.",
    );
  });

  it("puts a month-precision date in prose", () => {
    expect(narrative(bare, [{ ...bareCase, arrestYear: 1938, arrestMonth: 3, arrestDay: null, arrestDatePrecision: "m" }], labels)).toBe(
      "Арестован в марте 1938 года. Осудивший орган, статья и приговор в источнике не указаны. Сведений о реабилитации нет.",
    );
  });

  it("tells the normalised sentence type when the source states no sentence of its own", () => {
    expect(narrative(bare, [{ ...bareCase, sentenceType: "itl" }], labels)).toBe(
      "Арестован 10.08.1930. Приговор — лагерь. Осудивший орган и статья в источнике не указаны. Сведений о реабилитации нет.",
    );
    expect(narrative(bare, [{ ...bareCase, sentenceType: "itl", sentenceYears: 10 }], labels)).toBe(
      "Арестован 10.08.1930. Приговор — лагерь (10 лет). Осудивший орган и статья в источнике не указаны. Сведений о реабилитации нет.",
    );
  });

  it("drops a raw value's own trailing full stop", () => {
    expect(narrative({ ...bare, nationalityRaw: "русский", partyRaw: "б/п." }, [], labels)).toBe(
      "Национальность — русский, партийность — б/п. Сведений о делах в источнике нет.",
    );
  });

  it("says so when a death has neither date nor age", () => {
    expect(narrative({ ...bare, deathKind: "died" }, [], labels)).toBe(
      "Сведений о делах в источнике нет. Умер; дата смерти в источнике не указана.",
    );
    expect(narrative({ ...bare, sex: "f", deathKind: "died" }, [], labels)).toBe(
      "Сведений о делах в источнике нет. Умерла; дата смерти в источнике не указана.",
    );
  });

  it("reports execution and death with dates and age", () => {
    expect(narrative(executed, [firstCase], labels)).toContain("Расстрелян 17.11.1938.");
    const died: PersonRecord = { ...person, deathKind: "died", deathYear: 1978, deathMonth: 10, deathDay: 15, deathDatePrecision: "f", ageAtDeath: 86 };
    expect(narrative(died, [firstCase], labels)).toContain("Умер 15.10.1978 в возрасте 86 лет.");
    expect(narrative({ ...died, deathMonth: null, deathDay: null, deathDatePrecision: "y" }, [firstCase], labels)).toContain("Умер в 1978 году в возрасте 86 лет.");
  });

  it("puts the age after «в возрасте» in the genitive", () => {
    const died: PersonRecord = { ...bare, deathKind: "died", deathYear: 1938, deathDatePrecision: "y" };
    const aged = (ageAtDeath: number) => narrative({ ...died, ageAtDeath }, [], labels);
    expect(aged(21)).toContain("Умер в 1938 году в возрасте 21 года.");
    expect(aged(22)).toContain("в возрасте 22 лет.");
    expect(aged(11)).toContain("в возрасте 11 лет.");
    expect(aged(86)).toContain("в возрасте 86 лет.");
    expect(narrative({ ...died, sex: "f", deathYear: null, deathDatePrecision: null, ageAtDeath: 101 }, [], labels)).toBe(
      "Сведений о делах в источнике нет. Умерла в возрасте 101 года.",
    );
  });

  it("numbers the cases when there are several and says so when there are none", () => {
    const text = narrative(person, [firstCase, { ...bareCase, personId: 101, n: 2, arrestYear: 1949, arrestDatePrecision: "y", arrestMonth: null, arrestDay: null }], labels);
    expect(text).toContain("Дело 1. Арестован 27.03.1938.");
    expect(text).toContain("Дело 2. Арестован в 1949 году. Осудивший орган, статья и приговор в источнике не указаны.");
    expect(narrative(bare, [], labels)).toBe("Сведений о делах в источнике нет.");
  });
});

describe("narrativeParagraphs", () => {
  it("splits life-before-arrest, the case, the fate and the rehabilitation into their own paragraphs", () => {
    expect(narrativeParagraphs(executed, [firstCase], labels)).toEqual([
      "Родился в 1892 году, место рождения — ЧО, Троицкий р-н, п. Ключевка. Проживал — ЧО, Троицкий р-н, п. Ключевка. " +
        "Национальность — русский, образование — грамотный, партийность — б/п.",
      "Арестован 27.03.1938. Осуждён 14.11.1938, осудивший орган — Особ. тройка УНКВД ЧО, статья — 58-6-9-11. Приговор — 10 лет ИТЛ (лагерь).",
      "Расстрелян 17.11.1938.",
      "Реабилитирован 21.10.1960 (Военный трибунал Уральского военного округа).",
    ]);
  });

  it("gives each case of several its own paragraph, with the rehabilitation folded into one final paragraph", () => {
    const second: CaseRecord = {
      ...bareCase, n: 2, arrestYear: 1949, arrestMonth: null, arrestDay: null, arrestDatePrecision: "y",
      rehabYear: 1957, rehabMonth: 5, rehabDay: 12, rehabDatePrecision: "f",
    };
    expect(narrativeParagraphs(bare, [bareCase, second], labels)).toEqual([
      "Дело 1. Арестован 10.08.1930. Осудивший орган, статья и приговор в источнике не указаны.",
      "Дело 2. Арестован в 1949 году. Осудивший орган, статья и приговор в источнике не указаны.",
      "По делу 2 реабилитирован 12.05.1957. Сведений о реабилитации по делу 1 нет.",
    ]);
  });

  it("keeps the no-cases sentence as its own paragraph, with no fate or rehabilitation paragraph", () => {
    expect(narrativeParagraphs(bare, [], labels)).toEqual(["Сведений о делах в источнике нет."]);
  });

  it("still gives a rehabilitation paragraph, saying nothing is known, for a case without one", () => {
    expect(narrativeParagraphs(bare, [bareCase], labels)).toEqual([
      "Арестован 10.08.1930. Осудивший орган, статья и приговор в источнике не указаны.",
      "Сведений о реабилитации нет.",
    ]);
  });

  it("joins back to exactly narrative(), for a range of shapes (protects metaDescription and shareText)", () => {
    const shapes: Array<[PersonRecord, CaseRecord[]]> = [
      [person, [firstCase]],
      [executed, [firstCase]],
      [woman, [firstCase]],
      [bare, [bareCase]],
      [bare, []],
      [bare, [bareCase, { ...bareCase, n: 2, arrestYear: 1949, rehabYear: 1957, rehabMonth: 5, rehabDay: 12, rehabDatePrecision: "f" }]],
    ];
    for (const [p, cases] of shapes) {
      expect(narrative(p, cases, labels)).toBe(narrativeParagraphs(p, cases, labels).join(" "));
    }
  });
});

const abbreviations =
  "Родился в 1892 году, место рождения — Московская обл., г. Коломна, ул. Октябрьской Революции. Проживал — там же. Национальность — русский.";

describe("truncateAtSentence", () => {
  it("cuts at the last sentence end that fits, or hard-cuts with an ellipsis", () => {
    expect(truncateAtSentence("Один. Двое. Трое.", 11)).toBe("Один. Двое.");
    expect(truncateAtSentence("Раз. Два. Три.", 100)).toBe("Раз. Два. Три.");
    expect(truncateAtSentence("Однопредложение без точки внутри которое длиннее", 20)).toBe("Однопредложение без…");
    // A three-letter token reads as an abbreviation, not as a sentence end, so this hard-cuts.
    expect(truncateAtSentence("Раз. Два. Три.", 9)).toBe("Раз. Два…");
  });

  it("never cuts at an abbreviation", () => {
    expect(truncateAtSentence(abbreviations, 120)).toBe(
      "Родился в 1892 году, место рождения — Московская обл., г. Коломна, ул. Октябрьской Революции.",
    );
    expect(truncateAtSentence(abbreviations, 90)).toBe(
      "Родился в 1892 году, место рождения — Московская обл., г. Коломна, ул. Октябрьской Револю…",
    );
  });
});

describe("metaDescription", () => {
  it("opens with the name, then the narrative", () => {
    expect(metaDescription(bare, [], labels)).toBe("Сафронов Илья Федорович. Сведений о делах в источнике нет.");
  });
});

describe("badgesFor", () => {
  it("marks the arrest year, execution and rehabilitation", () => {
    expect(badgesFor(person, [firstCase]).map((b) => [b.key, b.label, b.tone])).toEqual([
      ["arrest", "Арест 1938", "neutral"],
      ["rehabilitated", "Реабилитирован 1960", "ok"],
    ]);
    expect(badgesFor(executed, [{ ...firstCase, rehabYear: null, rehabMonth: null, rehabDay: null, rehabDatePrecision: null, rehabBodyRaw: null }]).map((b) => b.key)).toEqual([
      "arrest", "executed", "no_rehab",
    ]);
    expect(badgesFor(woman, [firstCase]).map((b) => b.label)).toEqual(["Арест 1938", "Реабилитирована 1960"]);
    expect(badgesFor(bare, [])).toEqual([{ key: "no_rehab", label: "Реабилитация не указана", tone: "muted" }]);
  });
});

describe("timelineFor", () => {
  it("always yields the five slots with null for unknown steps", () => {
    const steps = timelineFor(person, [firstCase], labels);
    expect(steps.map((s) => [s.key, s.value, s.accent])).toEqual([
      ["born", "1892", false],
      ["arrest", "27.03.1938", true],
      ["sentence", "10 лет ИТЛ", false],
      ["died", null, false],
      ["rehab", "21.10.1960", false],
    ]);
    expect(timelineFor(executed, [firstCase], labels).find((s) => s.key === "executed")).toMatchObject({ value: "17.11.1938", accent: true });
    expect(timelineFor(bare, [], labels).every((s) => s.value === null)).toBe(true);
    // The arrest slot skips a case that states no arrest year, as the arrest badge does.
    const undated: CaseRecord = { ...bareCase, personId: 101, arrestYear: null, arrestMonth: null, arrestDay: null, arrestDatePrecision: null };
    expect(timelineFor(person, [undated, firstCase], labels).find((s) => s.key === "arrest")?.value).toBe("27.03.1938");
  });
});

describe("lifeYears", () => {
  it("renders the span, the birth year alone, or nothing", () => {
    expect(lifeYears({ ...person, deathYear: 1978 })).toBe("1892 — 1978");
    expect(lifeYears(person)).toBe("1892 г. р.");
    expect(lifeYears(bare)).toBeNull();
  });
});
