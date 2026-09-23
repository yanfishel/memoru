export type DatePrecision = "y" | "m" | "f";

export interface ParsedDate {
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
}

/** First three letters of a month word in any case form -> month number. */
const MONTH_STEMS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, май: 5, мая: 5, мае: 5, июн: 6,
  июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};

function monthFromWord(word: string): number | null {
  return MONTH_STEMS[word.slice(0, 3)] ?? null;
}

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;]+$/, "")
    .replace(/\s*(?:гг|г|года|году)\.?$/, "")
    .replace(/^в\s+/, "")
    .trim();
}

function build(year: number, month: number | null, day: number | null): ParsedDate | null {
  if (year < 1800 || year > 2030) return null;
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null) {
    const date = new Date(Date.UTC(year, (month ?? 1) - 1, day));
    if (date.getUTCMonth() !== (month ?? 1) - 1 || date.getUTCDate() !== day) return null;
  }
  const precision: DatePrecision = day !== null ? "f" : month !== null ? "m" : "y";
  return { year, month, day, precision };
}

export function parseRuDate(raw: string | undefined): ParsedDate | null {
  if (!raw) return null;
  const s = clean(raw);
  let m: RegExpExecArray | null;

  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) {
    return build(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  if ((m = /^(\d{1,2}) ([а-я]+)\.? (\d{4})$/.exec(s))) {
    const month = monthFromWord(m[2]);
    return month ? build(Number(m[3]), month, Number(m[1])) : null;
  }
  if ((m = /^(\d{1,2})\.(\d{4})$/.exec(s))) {
    return build(Number(m[2]), Number(m[1]), null);
  }
  if ((m = /^([а-я]+)\.? (\d{4})$/.exec(s))) {
    const month = monthFromWord(m[1]);
    return month ? build(Number(m[2]), month, null) : null;
  }
  if ((m = /^(\d{4})$/.exec(s))) {
    return build(Number(m[1]), null, null);
  }
  return null;
}
