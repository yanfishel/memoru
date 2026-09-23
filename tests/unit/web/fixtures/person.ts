import type { LabelMap } from "../../../../src/db/queries";
import type { CaseRecord, PersonRecord } from "../../../../src/db/schema";

export const labels: LabelMap = new Map([
  ["sex", new Map([["m", { labelRu: "мужчины", sortOrder: 1 }], ["f", { labelRu: "женщины", sortOrder: 2 }]])],
  ["nationality", new Map([["russian", { labelRu: "русские", sortOrder: 1 }], ["finnish", { labelRu: "финны", sortOrder: 2 }]])],
  ["education", new Map([["literate", { labelRu: "грамотные", sortOrder: 3 }]])],
  ["party", new Map([["none", { labelRu: "беспартийные", sortOrder: 1 }]])],
  ["birth_region", new Map([["RU-CHE", { labelRu: "Челябинская область", sortOrder: 1 }]])],
  ["birth_country", new Map([["RU", { labelRu: "Россия", sortOrder: 1 }]])],
  ["residence_region", new Map([["RU-CHE", { labelRu: "Челябинская область", sortOrder: 1 }]])],
  ["source_region", new Map([["RU-CHE", { labelRu: "Челябинская область", sortOrder: 1 }]])],
  ["death_kind", new Map([["executed", { labelRu: "расстреляны", sortOrder: 1 }], ["unknown", { labelRu: "не указано", sortOrder: 90 }]])],
  ["sentence_type", new Map([["itl", { labelRu: "лагерь", sortOrder: 2 }], ["vmn", { labelRu: "расстрел", sortOrder: 1 }]])],
]);

export const person: PersonRecord = {
  id: 101, surname: "Сафронов", givenName: "Илья", patronymic: "Федорович", titleYear: 1892, sex: "m",
  birthYear: 1892, birthMonth: null, birthDay: null, birthDatePrecision: "y",
  birthPlaceRaw: "ЧО, Троицкий р-н, п. Ключевка", birthCountryCode: "RU", birthRegionCode: "RU-CHE", sourceRegionCode: "RU-CHE",
  residenceRaw: "ЧО, Троицкий р-н, п. Ключевка", residenceRegionCode: "RU-CHE",
  nationalityRaw: "русский", nationalityCode: "russian", educationRaw: "грамотный", educationCode: "literate",
  partyRaw: "б/п", partyCode: "none", deathKind: "unknown", deathYear: null, deathMonth: null, deathDay: null, deathDatePrecision: null,
  ageAtDeath: null, caseCount: 1, firstArrestYear: 1938, ageAtArrest: 46, firstSentenceType: "itl",
  sourceRaw: "[https://archive74.ru/dbases/victim Книга памяти Челябинской обл.]",
  photoFile: null, photoCaptionRaw: null, openlistTitle: "Сафронов Илья Федорович (1892)",
  ageAtArrestBucket: "45-54", ageAtDeathBucket: "unknown", rehabilitated: true,
};

export const personWithPhoto: PersonRecord = {
  ...person,
  id: 105,
  photoFile: "Абрамович Дмитрий Иванович-1.jpg",
  photoCaptionRaw: "Фотография из коллекции фотодокументов [http://www.sinodik.ru/ Мемориального научно-просветительского центра «Бутово»]",
};

export const firstCase: CaseRecord = {
  personId: 101, n: 1, arrestYear: 1938, arrestMonth: 3, arrestDay: 27, arrestDatePrecision: "f",
  convictionYear: 1938, convictionMonth: 11, convictionDay: 14, convictionDatePrecision: "f",
  courtRaw: "Особ. тройка УНКВД ЧО", articleRaw: "58-6-9-11", sentenceRaw: "10 лет ИТЛ", sentenceType: "itl", sentenceYears: 10, sentenceMonths: null,
  rehabYear: 1960, rehabMonth: 10, rehabDay: 21, rehabDatePrecision: "f", rehabBodyRaw: "Военный трибунал Уральского военного округа",
};
