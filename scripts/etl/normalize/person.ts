import { splitCases } from "../parse/cases";
import { parseRuDate, type DatePrecision, type ParsedDate } from "../parse/date";
import { parseTitle } from "../parse/title";
import { UNKNOWN, UNRECOGNIZED, type Dictionaries, type Dictionary } from "./dicts";
import { sentenceTerm, sentenceTypeByRule } from "./sentence";

/** Open List Формуляр parameter names. Revisit after `etl census` (Task 12). */
export const PARAM = {
  birthDate: "дата рождения",
  birthPlace: "место рождения",
  residence: "место проживания",
  sex: "пол",
  nationality: "национальность",
  education: "образование",
  party: "партийность",
  execution: "расстрел",
  deathDate: "дата смерти",
  source: "источники данных",
  photo: "фотография",
  photoCaption: "подпись к фотографии",
} as const;

/** Legacy photo parameter, seen on a small number of pages (75 in the real dump). Used only
 * as a fallback when PARAM.photo is absent, empty, or whitespace-only — see normalizePerson. */
const PHOTO_PARAM_LEGACY = "фото";

/** Unicode format characters (category Cf) that sometimes trail a photo file name in the
 * source, e.g. a stray U+200E LEFT-TO-RIGHT MARK after the extension. */
const FORMAT_CHARS = /\p{Cf}/gu;

const PHOTO_EXTENSION = /\.(jpe?g|png|gif)$/i;

/** Turns a raw `фотография`/`фото` parameter value into the stored file name, or `null`
 * when the value isn't a recognizable image file name (e.g. "не сохранилось"). Values are
 * kept verbatim otherwise, spaces included — Task B converts them for the hot-linked URL.
 * This is an optional asset, not a coded dictionary field: a missing photo is `null`, never
 * `unknown`/`unrecognized` (CLAUDE.md's missing-value rule governs coded fields only). */
export function photoFileName(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(FORMAT_CHARS, "").trim();
  return PHOTO_EXTENSION.test(cleaned) ? cleaned : null;
}

/** Parameter names inside a numbered case (`<name> N`). */
export const CASE_PARAM = {
  arrestDate: "дата ареста",
  conviction: "осуждение",
  court: "осудивший орган",
  article: "статья",
  sentence: "приговор",
  rehabDate: "дата реабилитации",
  rehabBody: "реабилитирующий орган",
} as const;

export interface RawPerson {
  pageId: number;
  title: string;
  params: Record<string, string>;
  categories: string[];
}

export type DeathKind = "executed" | "died" | "unknown";

export interface PersonRow {
  id: number;
  surname: string;
  givenName: string | null;
  patronymic: string | null;
  titleYear: number | null;
  sex: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  birthDatePrecision: DatePrecision | null;
  birthPlaceRaw: string | null;
  birthCountryCode: string;
  birthRegionCode: string;
  sourceRegionCode: string;
  residenceRaw: string | null;
  residenceRegionCode: string;
  nationalityRaw: string | null;
  nationalityCode: string;
  educationRaw: string | null;
  educationCode: string;
  partyRaw: string | null;
  partyCode: string;
  deathKind: DeathKind;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  deathDatePrecision: DatePrecision | null;
  ageAtDeath: number | null;
  caseCount: number;
  firstArrestYear: number | null;
  ageAtArrest: number | null;
  firstSentenceType: string;
  sourceRaw: string | null;
  /** File name of the photo on ru.openlist.wiki (hot-linked, never downloaded), or `null`
   * when there's no usable photo parameter. See photoFileName. */
  photoFile: string | null;
  /** Provenance caption for the photo, kept verbatim, like sourceRaw. */
  photoCaptionRaw: string | null;
  /** The Open List page title, verbatim, so the person page can link back to its
   * CC BY-SA source (spec §5.3 person.openlist_title, §6/§10 attribution). */
  openlistTitle: string;
}

export interface CaseRow {
  personId: number;
  n: number;
  arrestYear: number | null;
  arrestMonth: number | null;
  arrestDay: number | null;
  arrestDatePrecision: DatePrecision | null;
  convictionYear: number | null;
  convictionMonth: number | null;
  convictionDay: number | null;
  convictionDatePrecision: DatePrecision | null;
  courtRaw: string | null;
  articleRaw: string | null;
  sentenceRaw: string | null;
  sentenceType: string;
  sentenceYears: number | null;
  sentenceMonths: number | null;
  rehabYear: number | null;
  rehabMonth: number | null;
  rehabDay: number | null;
  rehabDatePrecision: DatePrecision | null;
  rehabBodyRaw: string | null;
}

const MAX_AGE = 110;

function age(fromYear: number | null, toYear: number | null): number | null {
  if (fromYear === null || toYear === null) return null;
  const diff = toYear - fromYear;
  return diff >= 0 && diff <= MAX_AGE ? diff : null;
}

function parts(date: ParsedDate | null) {
  return {
    year: date?.year ?? null,
    month: date?.month ?? null,
    day: date?.day ?? null,
    precision: date?.precision ?? null,
  };
}

function resolveSentenceType(raw: string | undefined, dict: Dictionary): string {
  const fromDict = dict.lookup(raw);
  if (fromDict !== UNRECOGNIZED || raw === undefined) return fromDict;
  return sentenceTypeByRule(raw) ?? UNRECOGNIZED;
}

function resolveSourceRegion(categories: string[], dict: Dictionary): string {
  if (categories.length === 0) return UNKNOWN;
  for (const category of categories) {
    const code = dict.lookup(category);
    if (code !== UNRECOGNIZED && code !== UNKNOWN) return code;
  }
  return UNRECOGNIZED;
}

function resolveBirthPlace(place: string | undefined, dicts: Dictionaries) {
  const firstSegment = place?.split(",")[0];
  const regionCode = dicts.birth_region.lookup(firstSegment);
  let countryCode = dicts.birth_country.lookup(firstSegment);
  if (countryCode === UNRECOGNIZED) {
    const fromRegion = /^([A-Z]{2})(?:-|$)/.exec(regionCode);
    if (fromRegion) countryCode = fromRegion[1];
  }
  return { regionCode, countryCode };
}

/** Residence shares the region vocabulary with birth place: residence_region.csv holds
 * only residence-specific shapes (city names, "г. X"), everything else resolves through
 * birth_region.csv. */
function resolveResidence(place: string | undefined, dicts: Dictionaries): string {
  if (place === undefined) return UNKNOWN;
  const firstSegment = place.split(",")[0];
  const specific = dicts.residence_region.lookup(firstSegment);
  if (specific !== UNRECOGNIZED) return specific;
  return dicts.birth_region.lookup(firstSegment);
}

function resolveDeath(params: Record<string, string>): { kind: DeathKind; date: ParsedDate | null } {
  if (params[PARAM.execution] !== undefined) {
    return { kind: "executed", date: parseRuDate(params[PARAM.execution]) };
  }
  if (params[PARAM.deathDate] !== undefined) {
    return { kind: "died", date: parseRuDate(params[PARAM.deathDate]) };
  }
  return { kind: "unknown", date: null };
}

export function normalizePerson(raw: RawPerson, dicts: Dictionaries): { person: PersonRow; cases: CaseRow[] } {
  const title = parseTitle(raw.title);
  const { person: p, cases: rawCases } = splitCases(raw.params);

  const birth = parts(
    parseRuDate(p[PARAM.birthDate]) ?? (title.titleYear !== null ? parseRuDate(String(title.titleYear)) : null),
  );
  const death = resolveDeath(p);
  const deathParts = parts(death.date);
  const birthPlace = resolveBirthPlace(p[PARAM.birthPlace], dicts);

  const cases: CaseRow[] = rawCases.map(({ n, params: c }) => {
    const arrest = parts(parseRuDate(c[CASE_PARAM.arrestDate]));
    const conviction = parts(parseRuDate(c[CASE_PARAM.conviction]));
    const rehab = parts(parseRuDate(c[CASE_PARAM.rehabDate]));
    const sentenceRaw = c[CASE_PARAM.sentence] ?? null;
    const term = sentenceRaw ? sentenceTerm(sentenceRaw) : { years: null, months: null };
    return {
      personId: raw.pageId,
      n,
      arrestYear: arrest.year,
      arrestMonth: arrest.month,
      arrestDay: arrest.day,
      arrestDatePrecision: arrest.precision,
      convictionYear: conviction.year,
      convictionMonth: conviction.month,
      convictionDay: conviction.day,
      convictionDatePrecision: conviction.precision,
      courtRaw: c[CASE_PARAM.court] ?? null,
      articleRaw: c[CASE_PARAM.article] ?? null,
      sentenceRaw,
      sentenceType: resolveSentenceType(c[CASE_PARAM.sentence], dicts.sentence_type),
      sentenceYears: term.years,
      sentenceMonths: term.months,
      rehabYear: rehab.year,
      rehabMonth: rehab.month,
      rehabDay: rehab.day,
      rehabDatePrecision: rehab.precision,
      rehabBodyRaw: c[CASE_PARAM.rehabBody] ?? null,
    };
  });

  const first = cases[0];
  const person: PersonRow = {
    id: raw.pageId,
    surname: title.surname,
    givenName: title.givenName,
    patronymic: title.patronymic,
    titleYear: title.titleYear,
    sex: dicts.sex.lookup(p[PARAM.sex]),
    birthYear: birth.year,
    birthMonth: birth.month,
    birthDay: birth.day,
    birthDatePrecision: birth.precision,
    birthPlaceRaw: p[PARAM.birthPlace] ?? null,
    birthCountryCode: birthPlace.countryCode,
    birthRegionCode: birthPlace.regionCode,
    sourceRegionCode: resolveSourceRegion(raw.categories, dicts.source_region),
    residenceRaw: p[PARAM.residence] ?? null,
    residenceRegionCode: resolveResidence(p[PARAM.residence], dicts),
    nationalityRaw: p[PARAM.nationality] ?? null,
    nationalityCode: dicts.nationality.lookup(p[PARAM.nationality]),
    educationRaw: p[PARAM.education] ?? null,
    educationCode: dicts.education.lookup(p[PARAM.education]),
    partyRaw: p[PARAM.party] ?? null,
    partyCode: dicts.party.lookup(p[PARAM.party]),
    deathKind: death.kind,
    deathYear: deathParts.year,
    deathMonth: deathParts.month,
    deathDay: deathParts.day,
    deathDatePrecision: deathParts.precision,
    ageAtDeath: age(birth.year, deathParts.year),
    caseCount: cases.length,
    firstArrestYear: first?.arrestYear ?? null,
    ageAtArrest: age(birth.year, first?.arrestYear ?? null),
    firstSentenceType: first?.sentenceType ?? UNKNOWN,
    sourceRaw: p[PARAM.source] ?? null,
    photoFile: photoFileName((p[PARAM.photo]?.trim() || undefined) ?? p[PHOTO_PARAM_LEGACY]),
    photoCaptionRaw: p[PARAM.photoCaption] ?? null,
    openlistTitle: raw.title,
  };

  return { person, cases };
}
