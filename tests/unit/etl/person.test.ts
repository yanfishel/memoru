import { describe, expect, it } from "vitest";
import { loadAllDictionaries, parseDictionaryCsv } from "../../../scripts/etl/normalize/dicts";
import { normalizePerson, photoFileName, type RawPerson } from "../../../scripts/etl/normalize/person";

const dicts = loadAllDictionaries("data/dicts");

const SAFRONOV: RawPerson = {
  pageId: 101,
  title: "Сафронов Илья Федорович (1892)",
  params: {
    "дата рождения": "1892",
    "место рождения": "ЧО, Троицкий р-н, п. Ключевка",
    "национальность": "русский",
    "образование": "грамотный",
    "партийность": "б/п",
    "источники данных": "[https://archive74.ru/dbases/victim Книга памяти Челябинской обл.]",
    "дата ареста 1": "27.03.1938",
    "осуждение 1": "14.11.1938",
    "осудивший орган 1": "Особ. тройка УНКВД ЧО",
    "статья 1": "58-6-9-11",
    "приговор 1": "10 лет ИТЛ",
    "дата реабилитации 1": "21.10.1960",
    "реабилитирующий орган 1": "Военный трибунал Уральского военного округа",
    "пол": "мужчина",
  },
  categories: ["Открытый список", "Объединенный государственный архив Челябинской области", "Челябинская обл."],
};

const SVERKOT: RawPerson = {
  pageId: 103,
  title: "Сверкот Павел Валентинович (1903)",
  params: {
    "дата рождения": "1903",
    "место рождения": "Польша",
    "пол": "мужчина",
    "национальность": "немец",
    "образование": "неполное среднее",
    "партийность": "б/п",
    "дата ареста 1": "16.04.1938",
    "приговор 1": "ВМН (расстрел)",
    "расстрел": "17.10.1938",
    "источники данных": "Книга памяти Республики Башкортостан",
    "дата реабилитации 1": "30.06.1961",
    "статья 1": "58, п. 6",
  },
  categories: ["Все мартирологи", "Книга памяти Республики Башкортостан", "Башкирия"],
};

describe("normalizePerson", () => {
  it("normalizes a fully filled record", () => {
    const { person, cases } = normalizePerson(SAFRONOV, dicts);
    expect(person).toEqual({
      id: 101,
      surname: "Сафронов",
      givenName: "Илья",
      patronymic: "Федорович",
      titleYear: 1892,
      sex: "m",
      birthYear: 1892,
      birthMonth: null,
      birthDay: null,
      birthDatePrecision: "y",
      birthPlaceRaw: "ЧО, Троицкий р-н, п. Ключевка",
      birthCountryCode: "RU",
      birthRegionCode: "RU-CHE",
      sourceRegionCode: "RU-CHE",
      residenceRaw: null,
      residenceRegionCode: "unknown",
      nationalityRaw: "русский",
      nationalityCode: "russian",
      educationRaw: "грамотный",
      educationCode: "literate",
      partyRaw: "б/п",
      partyCode: "non_party",
      deathKind: "unknown",
      deathYear: null,
      deathMonth: null,
      deathDay: null,
      deathDatePrecision: null,
      ageAtDeath: null,
      caseCount: 1,
      firstArrestYear: 1938,
      ageAtArrest: 46,
      firstSentenceType: "itl",
      sourceRaw: "[https://archive74.ru/dbases/victim Книга памяти Челябинской обл.]",
      photoFile: null,
      photoCaptionRaw: null,
      openlistTitle: "Сафронов Илья Федорович (1892)",
    });
    expect(cases).toEqual([
      {
        personId: 101,
        n: 1,
        arrestYear: 1938,
        arrestMonth: 3,
        arrestDay: 27,
        arrestDatePrecision: "f",
        convictionYear: 1938,
        convictionMonth: 11,
        convictionDay: 14,
        convictionDatePrecision: "f",
        courtRaw: "Особ. тройка УНКВД ЧО",
        articleRaw: "58-6-9-11",
        sentenceRaw: "10 лет ИТЛ",
        sentenceType: "itl",
        sentenceYears: 10,
        sentenceMonths: null,
        rehabYear: 1960,
        rehabMonth: 10,
        rehabDay: 21,
        rehabDatePrecision: "f",
        rehabBodyRaw: "Военный трибунал Уральского военного округа",
      },
    ]);
  });

  it("derives execution, foreign birth country and source region from categories", () => {
    const { person, cases } = normalizePerson(SVERKOT, dicts);
    expect(person).toMatchObject({
      birthCountryCode: "PL",
      birthRegionCode: "unrecognized",
      sourceRegionCode: "RU-BA",
      nationalityCode: "german",
      educationCode: "incomplete_secondary",
      deathKind: "executed",
      deathYear: 1938,
      deathMonth: 10,
      deathDay: 17,
      deathDatePrecision: "f",
      ageAtDeath: 35,
      firstArrestYear: 1938,
      ageAtArrest: 35,
      firstSentenceType: "vmn",
      openlistTitle: "Сверкот Павел Валентинович (1903)",
    });
    expect(cases[0]).toMatchObject({ sentenceType: "vmn", sentenceYears: null, courtRaw: null, rehabYear: 1961 });
  });

  it("codes missing values as unknown and falls back to the title year", () => {
    const { person, cases } = normalizePerson(
      { pageId: 5, title: "Иванов Иван (1900)", params: { "национальность": "эскимос" }, categories: [] },
      dicts,
    );
    expect(person).toMatchObject({
      sex: "unknown",
      birthYear: 1900,
      birthDatePrecision: "y",
      birthCountryCode: "unknown",
      birthRegionCode: "unknown",
      sourceRegionCode: "unknown",
      nationalityCode: "unrecognized",
      educationCode: "unknown",
      partyCode: "unknown",
      caseCount: 0,
      firstArrestYear: null,
      ageAtArrest: null,
      firstSentenceType: "unknown",
    });
    expect(cases).toEqual([]);
  });

  it("uses the lowest-numbered case for first-arrest statistics", () => {
    const { person, cases } = normalizePerson(
      {
        pageId: 6,
        title: "Петров Петр Петрович",
        params: {
          "дата рождения": "1900",
          "дата ареста 2": "1949",
          "приговор 2": "5 лет ссылки",
          "дата ареста 1": "1937",
          "приговор 1": "8 лет ИТЛ",
        },
        categories: ["Неизвестная категория"],
      },
      dicts,
    );
    expect(cases.map((c) => c.n)).toEqual([1, 2]);
    expect(person).toMatchObject({
      caseCount: 2,
      firstArrestYear: 1937,
      ageAtArrest: 37,
      firstSentenceType: "itl",
      sourceRegionCode: "unrecognized",
    });
  });

  it("drops implausible ages", () => {
    const { person } = normalizePerson(
      { pageId: 7, title: "X", params: { "дата рождения": "1950", "дата ареста 1": "1937" }, categories: [] },
      dicts,
    );
    expect(person.ageAtArrest).toBeNull();
  });

  it("prefers the dictionary over the rule for sentence type", () => {
    // sentenceTypeByRule would classify a value containing "ИТЛ" as "itl";
    // the dictionary maps this exact value to "zak" and must win.
    const overriddenDicts = {
      ...dicts,
      sentence_type: parseDictionaryCsv("sentence_type", "raw_value,code,method,reviewed\n10 лет ИТЛ,zak,manual,true\n"),
    };
    const { person, cases } = normalizePerson(
      { pageId: 8, title: "X", params: { "приговор 1": "10 лет ИТЛ" }, categories: [] },
      overriddenDicts,
    );
    expect(cases[0].sentenceType).toBe("zak");
    expect(person.firstSentenceType).toBe("zak");
  });

  it("marks a sentence unrecognized when neither the dictionary nor a rule classifies it", () => {
    const { person, cases } = normalizePerson(
      { pageId: 9, title: "X", params: { "приговор 1": "освобожден за недоказанностью" }, categories: [] },
      dicts,
    );
    expect(cases[0].sentenceType).toBe("unrecognized");
    expect(person.firstSentenceType).toBe("unrecognized");
  });
});

describe("residence", () => {
  it("resolves the region through residence_region, then birth_region", () => {
    const withOblast: RawPerson = {
      ...SAFRONOV,
      params: { ...SAFRONOV.params, "место проживания": "Челябинская обл., Троицкий р-н, п. Ключевка" },
    };
    const { person } = normalizePerson(withOblast, dicts);
    expect(person.residenceRaw).toBe("Челябинская обл., Троицкий р-н, п. Ключевка");
    expect(person.residenceRegionCode).toBe("RU-CHE");
  });

  it("prefers a residence-specific row over the birth dictionary", () => {
    const residenceOnly = parseDictionaryCsv(
      "residence_region",
      "raw_value,code,method,reviewed\nг. Челябинск,RU-CHE,manual,true\n",
    );
    const withCity: RawPerson = {
      ...SAFRONOV,
      params: { ...SAFRONOV.params, "место проживания": "г. Челябинск, ул. Кирова" },
    };
    const { person } = normalizePerson(withCity, { ...dicts, residence_region: residenceOnly });
    expect(person.residenceRegionCode).toBe("RU-CHE");
  });

  it("codes a missing value unknown and an unmapped value unrecognized", () => {
    expect(normalizePerson(SAFRONOV, dicts).person.residenceRegionCode).toBe("unknown");
    const odd: RawPerson = { ...SAFRONOV, params: { ...SAFRONOV.params, "место проживания": "нигде" } };
    expect(normalizePerson(odd, dicts).person.residenceRegionCode).toBe("unrecognized");
  });
});

describe("photoFileName", () => {
  it("accepts a plain jpg file name", () => {
    expect(photoFileName("Абрамович Дмитрий Иванович-1.jpg")).toBe("Абрамович Дмитрий Иванович-1.jpg");
  });

  it("accepts an underscored name with parentheses", () => {
    expect(photoFileName("Абиссов_Александр_Афанасьевич_(1873).jpg")).toBe(
      "Абиссов_Александр_Афанасьевич_(1873).jpg",
    );
  });

  it("keeps spaces verbatim, like place values (Task B converts them)", () => {
    expect(photoFileName("Агния (Благовещенская Анна Никитична)-1.jpg")).toBe(
      "Агния (Благовещенская Анна Никитична)-1.jpg",
    );
  });

  it("accepts an upper-case .JPEG extension", () => {
    expect(photoFileName("Портрет.JPEG")).toBe("Портрет.JPEG");
  });

  it("strips a trailing U+200E left-to-right mark", () => {
    expect(photoFileName("Портрет.jpg‎")).toBe("Портрет.jpg");
  });

  it("rejects a value that isn't a file name", () => {
    expect(photoFileName("не сохранилось")).toBeNull();
  });

  it("returns null for an empty value and for an absent one", () => {
    expect(photoFileName("")).toBeNull();
    expect(photoFileName(undefined)).toBeNull();
  });
});

describe("photo fields in normalizePerson", () => {
  it("carries the file name and caption from the template", () => {
    const withPhoto: RawPerson = {
      ...SAFRONOV,
      params: {
        ...SAFRONOV.params,
        "фотография": "Сафронов_Илья_Федорович.jpg",
        "подпись к фотографии":
          "Фотография из коллекции фотодокументов [http://www.sinodik.ru/ Мемориального научно-просветительского центра «Бутово»]",
      },
    };
    const { person } = normalizePerson(withPhoto, dicts);
    expect(person.photoFile).toBe("Сафронов_Илья_Федорович.jpg");
    expect(person.photoCaptionRaw).toBe(
      "Фотография из коллекции фотодокументов [http://www.sinodik.ru/ Мемориального научно-просветительского центра «Бутово»]",
    );
  });

  it("falls back to the legacy фото parameter when фотография is absent", () => {
    const legacyOnly: RawPerson = { ...SAFRONOV, params: { ...SAFRONOV.params, "фото": "Легаси.png" } };
    expect(normalizePerson(legacyOnly, dicts).person.photoFile).toBe("Легаси.png");
  });

  it("does not fall back to фото when фотография is present but not a recognizable file name", () => {
    const bothPresent: RawPerson = {
      ...SAFRONOV,
      params: { ...SAFRONOV.params, "фотография": "не сохранилось", "фото": "Легаси.png" },
    };
    expect(normalizePerson(bothPresent, dicts).person.photoFile).toBeNull();
  });

  it("falls back to фото when фотография is present but empty or whitespace-only", () => {
    const empty: RawPerson = { ...SAFRONOV, params: { ...SAFRONOV.params, "фотография": "", "фото": "Легаси.png" } };
    expect(normalizePerson(empty, dicts).person.photoFile).toBe("Легаси.png");
    const whitespace: RawPerson = { ...SAFRONOV, params: { ...SAFRONOV.params, "фотография": "   ", "фото": "Легаси.png" } };
    expect(normalizePerson(whitespace, dicts).person.photoFile).toBe("Легаси.png");
  });
});
