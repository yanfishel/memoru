import { normalizeKey } from "./text";

export type SentenceType = "vmn" | "itl" | "vys" | "zak" | "pr" | "other";

// Order matters: the first matching rule wins.
const RULES: Array<[SentenceType, RegExp]> = [
  ["vmn", /(^|[^а-я])вмн([^а-я]|$)|расстрел/],
  ["itl", /(^|[^а-я])итл([^а-я]|$)|лагер/],
  ["vys", /высыл|ссылк|спецпосел|выселен/],
  ["pr", /(принудительн|исправительн)[а-я-]*\s+работ/],
  ["zak", /лишени[ея] свободы|тюрем|тюрьм|заключени/],
];

export function sentenceTypeByRule(raw: string): SentenceType | null {
  const text = normalizeKey(raw);
  for (const [type, pattern] of RULES) {
    if (pattern.test(text)) return type;
  }
  return null;
}

const MAX_TERM_YEARS = 25;
const MAX_TERM_MONTHS = MAX_TERM_YEARS * 12;

export function sentenceTerm(raw: string): { years: number | null; months: number | null } {
  const text = raw.toLowerCase();
  const yearMatch = /(\d+)\s*(?:лет|года|год|г\.)/.exec(text);
  // "мес" alone also matches inside «место» (place); require the full word
  // «месяц»/«месяцев»/etc. or the abbreviation «мес.» so a phrase like
  // «12.10.1923 место ссылки заменено» is not misread as a 1923-month term.
  const monthMatch = /(\d+)\s*мес(?:\.|яц)/.exec(text);
  const years = yearMatch ? Number(yearMatch[1]) : null;
  const months = monthMatch ? Number(monthMatch[1]) : null;
  return {
    years: years !== null && years >= 1 && years <= MAX_TERM_YEARS ? years : null,
    months: months !== null && months >= 1 && months <= MAX_TERM_MONTHS ? months : null,
  };
}
