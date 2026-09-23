/**
 * The person page's view model: everything that turns a `person`/`person_case` row into text is here,
 * pure and unit-tested, so the page component only lays it out. Browser-safe (type-only imports); it
 * is value-imported by client modules (`ResultTable.tsx`, `filter-chips.ts`, via `labelOf`),
 * so nothing here may pull in a Node-only module such as `node:crypto` — `photoUrl` lives in
 * `person-photo.ts` (`import "server-only"`) for exactly that reason.
 */
import type { LabelMap } from "@/db/queries";
import type { CaseRecord, PersonRecord } from "@/db/schema";
import { pluralRu, pluralRuGenitive } from "./format";
import { isSentenceEnd } from "./sentences";
import { UI } from "./ui-text";

export interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "16.04.1938" for a full date, "апрель 1938" for a month, "1938" for a year; null when nothing is known. */
export function formatDate(d: DateParts): string | null {
  if (d.year === null) return null;
  if (d.precision === "f" && d.month !== null && d.day !== null) return `${pad(d.day)}.${pad(d.month)}.${d.year}`;
  if (d.month !== null) return `${UI.person.months[d.month - 1]} ${d.year}`;
  return String(d.year);
}

/** ISO 8601 truncated to the known precision, for JSON-LD. */
export function isoDate(d: DateParts): string | null {
  if (d.year === null) return null;
  if (d.precision === "f" && d.month !== null && d.day !== null) return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  if (d.month !== null) return `${d.year}-${pad(d.month)}`;
  return String(d.year);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A full ISO `YYYY-MM-DD` date as readable Russian prose: "15 сентября 2026" (footer's data-date
 * line — do not use this for the person page, which keeps the raw ISO string).
 * Null for anything that is not a well-formed calendar date, including a missing input.
 */
export function formatDateLong(iso: string | null): string | null {
  if (iso === null) return null;
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${UI.person.monthsGen[month - 1]} ${year}`;
}

export function fullName(p: Pick<PersonRecord, "surname" | "givenName" | "patronymic">): string {
  return [p.surname, p.givenName, p.patronymic].filter((part): part is string => !!part).join(" ");
}

/** The source page, by its verbatim title (spec §10: every person page links back). */
export function openlistUrl(title: string): string {
  return `https://ru.openlist.wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export function labelOf(labels: LabelMap, field: string, code: string): string {
  if (code === "unknown") return UI.notStated;
  if (code === "unrecognized") return UI.unrecognized;
  return labels.get(field)?.get(code)?.labelRu ?? code;
}

function knownLabel(labels: LabelMap, field: string, code: string): string | null {
  return code === "unknown" || code === "unrecognized" ? null : labelOf(labels, field, code);
}

export function formatTerm(years: number | null, months: number | null): string | null {
  const parts: string[] = [];
  if (years !== null) parts.push(`${years} ${pluralRu(years, UI.person.years)}`);
  if (months !== null) parts.push(`${months} ${pluralRu(months, UI.person.monthsOfTerm)}`);
  return parts.length ? parts.join(" ") : null;
}

export interface SourceSegment {
  text: string;
  href?: string;
}

const WIKI_LINK = /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]|\[(https?:\/\/\S+)(?:\s+([^\]]*))?\]/g;

/** `источники данных` is wiki markup: `[url text]` external links, `[[Page|text]]` internal ones, plain text between. */
export function sourceSegments(raw: string): SourceSegment[] {
  const out: SourceSegment[] = [];
  let last = 0;
  for (const match of raw.matchAll(WIKI_LINK)) {
    if (match.index > last) out.push({ text: raw.slice(last, match.index) });
    if (match[1] !== undefined) {
      // `[[http://… text]]` occurs in the data: a misplaced external link, rendered as one.
      const external = /^(https?:\/\/\S+)\s+([\s\S]*)$/.exec(match[1]);
      if (external) out.push({ text: external[2], href: external[1] });
      else out.push({ text: match[2] ?? match[1].replace(/^[^:]+:/, "") });
    } else {
      out.push({ text: match[4]?.trim() || match[3], href: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last) });
  return out.filter((segment) => segment.text !== "");
}

export interface Row {
  term: string;
  /** The raw source value when there is one, else the normalised label; null renders as "не указано". */
  value: string | null;
  /** The normalised label when it adds something to the raw value. */
  note: string | null;
}

function row(term: string, raw: string | null, normalized: string | null): Row {
  const value = raw ?? normalized;
  const note = raw !== null && normalized !== null && normalized !== raw ? normalized : null;
  return { term, value, note };
}

const F = UI.person.fields;
const V = UI.person.values;

/**
 * A field the source carries in its own words, which the dictionary only buckets. The raw value already
 * reads as this person's own ("финка"), while the bucket label is written for charts and filters
 * ("финны"), so the label stands in only where the source says nothing (amended 2026-09-18: the label
 * used to follow the raw value in parentheses, repeating it in the wrong grammatical form).
 */
function coded(term: string, raw: string | null, label: string | null): Row {
  return { term, value: raw ?? label, note: null };
}

function sexValue(sex: string): string {
  if (sex === "m" || sex === "f") return V.sex[sex];
  return sex === "unrecognized" ? V.sex.unrecognized : V.sex.unknown;
}

function fateValue(kind: string, g: Gender): string {
  if (kind === "executed") return pick(V.fate.executed, g);
  if (kind === "died") return pick(V.fate.died, g);
  return kind === "unrecognized" ? V.fate.unrecognized : V.fate.unknown;
}

function birthOf(p: PersonRecord): DateParts {
  return { year: p.birthYear, month: p.birthMonth, day: p.birthDay, precision: p.birthDatePrecision };
}

function deathOf(p: PersonRecord): DateParts {
  return { year: p.deathYear, month: p.deathMonth, day: p.deathDay, precision: p.deathDatePrecision };
}

export function personRows(p: PersonRecord, labels: LabelMap): Row[] {
  const birthGeo = [knownLabel(labels, "birth_region", p.birthRegionCode), knownLabel(labels, "birth_country", p.birthCountryCode)]
    .filter((part): part is string => part !== null)
    .join(", ");
  const death = formatDate(deathOf(p));
  const fate = fateValue(p.deathKind, genderOf(p));
  return [
    row(F.sex, sexValue(p.sex), null),
    row(F.birthDate, formatDate(birthOf(p)), null),
    row(F.birthPlace, p.birthPlaceRaw, birthGeo || null),
    row(F.residence, p.residenceRaw, knownLabel(labels, "residence_region", p.residenceRegionCode)),
    coded(F.nationality, p.nationalityRaw, labelOf(labels, "nationality", p.nationalityCode)),
    coded(F.education, p.educationRaw, labelOf(labels, "education", p.educationCode)),
    coded(F.party, p.partyRaw, labelOf(labels, "party", p.partyCode)),
    row(F.sourceRegion, null, labelOf(labels, "source_region", p.sourceRegionCode)),
    row(F.fate, death === null ? fate : `${fate}, ${death}`, null),
    row(F.ageAtDeath, p.ageAtDeath === null ? null : String(p.ageAtDeath), null),
  ];
}

export function caseRows(c: CaseRecord, labels: LabelMap): Row[] {
  const sentenceNote = [knownLabel(labels, "sentence_type", c.sentenceType), formatTerm(c.sentenceYears, c.sentenceMonths)]
    .filter((part): part is string => part !== null)
    .join(", ");
  return [
    row(F.arrestDate, formatDate({ year: c.arrestYear, month: c.arrestMonth, day: c.arrestDay, precision: c.arrestDatePrecision }), null),
    row(F.conviction, formatDate({ year: c.convictionYear, month: c.convictionMonth, day: c.convictionDay, precision: c.convictionDatePrecision }), null),
    row(F.court, c.courtRaw, null),
    row(F.article, c.articleRaw, null),
    coded(F.sentence, c.sentenceRaw, sentenceNote || labelOf(labels, "sentence_type", c.sentenceType)),
    row(F.rehabDate, formatDate({ year: c.rehabYear, month: c.rehabMonth, day: c.rehabDay, precision: c.rehabDatePrecision }), null),
    row(F.rehabBody, c.rehabBodyRaw, null),
  ];
}

type Gender = "m" | "f";

/** The dictionary leaves 2 % of records without a sex; the masculine form is the conventional default. */
function genderOf(p: PersonRecord): Gender {
  return p.sex === "f" ? "f" : "m";
}

function pick(forms: readonly [string, string], g: Gender): string {
  return g === "m" ? forms[0] : forms[1];
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The parenthetical explains what the source's own wording leaves unsaid: "ВМН (расстрел)" needs no "(расстрел)". */
function unsaid(raw: string, parts: readonly (string | null)[]): string[] {
  const said = raw.toLowerCase();
  return parts.filter((part): part is string => part !== null && !said.includes(part.toLowerCase()));
}

/** Raw values often end in a full stop of their own; one trailing dot goes, so prose keeps a single one. */
function clean(raw: string): string {
  return raw.endsWith(".") ? raw.slice(0, -1) : raw;
}

/** Dates in prose: "27.03.1892" for a full date, "в апреле 1892 года" for a month, "в 1892 году" for a year. */
function dateOrYear(d: DateParts): string | null {
  const N = UI.person.narrative;
  if (d.year === null) return null;
  if (d.precision === "f" && d.month !== null && d.day !== null) return formatDate(d);
  if (d.month !== null) return N.inMonth(UI.person.monthsPrep[d.month - 1], d.year);
  return N.inYear(d.year);
}

function arrestOf(c: CaseRecord): DateParts {
  return { year: c.arrestYear, month: c.arrestMonth, day: c.arrestDay, precision: c.arrestDatePrecision };
}

function convictionOf(c: CaseRecord): DateParts {
  return { year: c.convictionYear, month: c.convictionMonth, day: c.convictionDay, precision: c.convictionDatePrecision };
}

function rehabOf(c: CaseRecord): DateParts {
  return { year: c.rehabYear, month: c.rehabMonth, day: c.rehabDay, precision: c.rehabDatePrecision };
}

function missingSentence(keys: Array<"court" | "article" | "sentence">): string | null {
  const N = UI.person.narrative;
  if (keys.length === 0) return null;
  const names = keys.map((k) => N.missing[k][0]);
  if (keys.length === 1) return `${cap(names[0])} ${N.notStatedOne[N.missing[keys[0]][1]]}.`;
  return `${cap(names.slice(0, -1).join(", "))} и ${names[names.length - 1]} ${N.notStatedMany}.`;
}

function caseSentences(c: CaseRecord, g: Gender, labels: LabelMap, lead: string): string[] {
  const N = UI.person.narrative;
  const out: string[] = [];
  const arrest = dateOrYear(arrestOf(c));
  out.push(`${lead}${pick(N.arrested, g)}${arrest ? ` ${arrest}` : ""}.`);
  const conviction = dateOrYear(convictionOf(c));
  const details = [c.courtRaw ? N.court(clean(c.courtRaw)) : null, c.articleRaw ? N.article(clean(c.articleRaw)) : null].filter((d): d is string => d !== null);
  if (conviction || details.length) {
    const head = conviction ? `${pick(N.convicted, g)} ${conviction}` : cap(details.shift()!);
    out.push(`${head}${details.length ? `, ${details.join(", ")}` : ""}.`);
  }
  // Without a raw sentence the normalised type still says what happened, so it is told rather than listed as missing.
  const sentenceType = knownLabel(labels, "sentence_type", c.sentenceType);
  const term = formatTerm(c.sentenceYears, c.sentenceMonths);
  if (c.sentenceRaw) {
    const note = unsaid(c.sentenceRaw, [sentenceType, term]).join(", ");
    out.push(`${N.sentence(clean(c.sentenceRaw))}${note ? ` (${note})` : ""}.`);
  } else if (sentenceType) {
    out.push(`${N.sentence(sentenceType)}${term ? ` (${term})` : ""}.`);
  }
  const missing = missingSentence(
    [c.courtRaw ? null : "court", c.articleRaw ? null : "article", c.sentenceRaw || sentenceType ? null : "sentence"].filter(
      (k): k is "court" | "article" | "sentence" => k !== null,
    ),
  );
  if (missing) out.push(missing);
  return out;
}

/** "Реабилитирован 21.10.1960 (body)." for a rehabilitated case, null when the case states neither a date nor a body. */
function rehabSentence(c: CaseRecord, g: Gender, n: number | null): string | null {
  const N = UI.person.narrative;
  const date = dateOrYear(rehabOf(c));
  const body = c.rehabBodyRaw ? ` (${clean(c.rehabBodyRaw)})` : "";
  if (date === null && body === "") return null;
  return `${n === null ? pick(N.rehabilitated, g) : pick(N.rehabilitatedCase(n), g)}${date ? ` ${date}` : ""}${body}.`;
}

/**
 * Rehabilitation closes the story, after the fate. One case: one statement. Several: a statement per
 * rehabilitated case by number, and the cases without one folded into a single sentence (spec §5.2);
 * when no case has any, one sentence as for a single case.
 */
function rehabSentences(cases: CaseRecord[], g: Gender): string[] {
  const N = UI.person.narrative;
  if (cases.length === 0) return [];
  if (cases.length === 1) return [rehabSentence(cases[0], g, null) ?? N.noRehab];
  const told = cases.map((c, i) => rehabSentence(c, g, i + 1));
  const untold = told.flatMap((t, i) => (t === null ? [i + 1] : []));
  if (untold.length === cases.length) return [N.noRehab];
  const out = told.filter((t): t is string => t !== null);
  if (untold.length) out.push(N.noRehabCases(untold));
  return out;
}

/**
 * Spec §5.2: the story from the fields, places verbatim, missing groups folded into one sentence
 * each — built as paragraphs (life before the arrest, one per case, the fate, the rehabilitation),
 * empty ones dropped. `narrative()` flattens this to one string for the meta description and the
 * share text; a nested `join(" ")` of the paragraphs equals the flat sentence-by-sentence join, so
 * that text never changes.
 */
export function narrativeParagraphs(p: PersonRecord, cases: CaseRecord[], labels: LabelMap): string[] {
  const N = UI.person.narrative;
  const g = genderOf(p);

  const life: string[] = [];
  const birth = dateOrYear(birthOf(p));
  if (birth) life.push(`${pick(N.born, g)} ${birth}${p.birthPlaceRaw ? `, ${N.birthPlace(clean(p.birthPlaceRaw))}` : ""}.`);
  else if (p.birthPlaceRaw) life.push(N.birthPlaceAlone(clean(p.birthPlaceRaw)));
  if (p.residenceRaw) life.push(`${pick(N.lived, g)} — ${clean(p.residenceRaw)}.`);
  const traits = [p.nationalityRaw ? N.nationality(clean(p.nationalityRaw)) : null, p.educationRaw ? N.education(clean(p.educationRaw)) : null, p.partyRaw ? N.party(clean(p.partyRaw)) : null]
    .filter((t): t is string => t !== null);
  if (traits.length) life.push(`${cap(traits.join(", "))}.`);

  const caseParagraphs =
    cases.length === 0
      ? [N.noCases]
      : cases.map((c, i) => caseSentences(c, g, labels, cases.length > 1 ? `${N.caseN(i + 1)} ` : "").join(" "));

  const fate: string[] = [];
  const death = dateOrYear(deathOf(p));
  if (p.deathKind === "executed") fate.push(`${pick(N.executed, g)}${death ? ` ${death}` : ""}.`);
  else if (p.deathKind === "died") {
    if (death === null && p.ageAtDeath === null) fate.push(pick(N.diedUnknown, g));
    else {
      const age = p.ageAtDeath === null ? null : N.aged(p.ageAtDeath, pluralRuGenitive(p.ageAtDeath, UI.person.yearsGenitive));
      fate.push(`${pick(N.died, g)}${death ? ` ${death}` : ""}${age ? ` ${age}` : ""}.`);
    }
  }

  const rehab = rehabSentences(cases, g);

  return [life.join(" "), ...caseParagraphs, fate.join(" "), rehab.join(" ")].filter((paragraph) => paragraph.length > 0);
}

/** Flattened for the meta description, the share text and any other one-string consumer. */
export function narrative(p: PersonRecord, cases: CaseRecord[], labels: LabelMap): string {
  return narrativeParagraphs(p, cases, labels).join(" ");
}

/** The meta description: whole sentences under `max`, else a hard cut with an ellipsis. */
export function truncateAtSentence(text: string, max = 200): string {
  if (text.length <= max) return text;
  for (let cut = text.lastIndexOf(". ", max - 1); cut > 0; cut = text.lastIndexOf(". ", cut - 1)) {
    if (isSentenceEnd(text, cut)) return text.slice(0, cut + 1);
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** The page's meta description: the name, then as much of the narrative as fits in whole sentences. */
export function metaDescription(p: PersonRecord, cases: CaseRecord[], labels: LabelMap): string {
  return truncateAtSentence(`${fullName(p)}. ${narrative(p, cases, labels)}`);
}

export interface Badge {
  key: "arrest" | "executed" | "rehabilitated" | "no_rehab";
  label: string;
  tone: "neutral" | "accent" | "ok" | "muted";
}

export function badgesFor(p: PersonRecord, cases: CaseRecord[]): Badge[] {
  const B = UI.person.badges;
  const g = genderOf(p);
  const out: Badge[] = [];
  const arrestYear = cases.find((c) => c.arrestYear !== null)?.arrestYear ?? null;
  if (arrestYear !== null) out.push({ key: "arrest", label: B.arrest(arrestYear), tone: "neutral" });
  if (p.deathKind === "executed") out.push({ key: "executed", label: pick(B.executed, g), tone: "accent" });
  const rehabYear = cases.find((c) => c.rehabYear !== null)?.rehabYear ?? null;
  const rehabilitated = p.rehabilitated || rehabYear !== null || cases.some((c) => c.rehabBodyRaw);
  if (rehabilitated) out.push({ key: "rehabilitated", label: pick(B.rehabilitated(rehabYear), g), tone: "ok" });
  else out.push({ key: "no_rehab", label: B.noRehab, tone: "muted" });
  return out;
}

export interface TimelineStep {
  key: "born" | "arrest" | "sentence" | "executed" | "died" | "rehab";
  label: string;
  value: string | null;
  accent: boolean;
}

/** Five slots, in life order; unknown steps keep their slot with a null value (hollow circles). */
export function timelineFor(p: PersonRecord, cases: CaseRecord[], labels: LabelMap): TimelineStep[] {
  const T = UI.person.timeline;
  const first = cases[0];
  // The arrest slot follows the badges: the first case that actually states an arrest year.
  const arrested = cases.find((c) => c.arrestYear !== null);
  const end: TimelineStep["key"] = p.deathKind === "executed" ? "executed" : "died";
  const sentence = first ? (first.sentenceRaw ?? knownLabel(labels, "sentence_type", first.sentenceType)) : null;
  const rehab = cases.find((c) => c.rehabYear !== null);
  return [
    { key: "born", label: genderOf(p) === "f" ? T.bornF : T.born, value: formatDate(birthOf(p)), accent: false },
    { key: "arrest", label: T.arrest, value: arrested ? formatDate(arrestOf(arrested)) : null, accent: true },
    { key: "sentence", label: T.sentence, value: sentence, accent: false },
    { key: end, label: end === "executed" ? T.executed : T.died, value: formatDate(deathOf(p)), accent: end === "executed" },
    { key: "rehab", label: T.rehab, value: rehab ? formatDate(rehabOf(rehab)) : null, accent: false },
  ];
}

export function lifeYears(p: PersonRecord): string | null {
  if (p.birthYear === null) return null;
  return p.deathYear === null ? UI.person.bornIn(p.birthYear) : UI.person.lifeYears(p.birthYear, p.deathYear);
}

/** schema.org Person (spec §6.1). Only fields the record actually has. */
export function personJsonLd(p: PersonRecord, url: string): Record<string, unknown> {
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Person", name: fullName(p), familyName: p.surname };
  if (p.givenName) ld.givenName = p.givenName;
  if (p.patronymic) ld.additionalName = p.patronymic;
  const birth = isoDate(birthOf(p));
  if (birth) ld.birthDate = birth;
  const death = isoDate(deathOf(p));
  if (death) ld.deathDate = death;
  if (p.birthPlaceRaw) ld.birthPlace = { "@type": "Place", name: p.birthPlaceRaw };
  if (p.sex === "m") ld.gender = "Male";
  else if (p.sex === "f") ld.gender = "Female";
  ld.url = url;
  ld.sameAs = openlistUrl(p.openlistTitle);
  return ld;
}
