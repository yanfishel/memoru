const NARROW_NBSP = " ";

export function formatInt(n: number): string {
  return new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 })
    .format(n)
    .replace(/[\s  ]/g, NARROW_NBSP);
}

/** No space before the sign (2026-09-18 review): "44%", not "44 %" — a plain space or NBSP. */
export function formatPercent(share: number, digits = 1): string {
  const value = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(share * 100);
  return `${value}%`;
}

/** A whole-percent share for prose ("52%"), where formatPercent's decimal would be false precision. */
export function formatShareWords(share: number): string {
  return formatPercent(share, 0);
}

export function formatYearRange(from: number, to: number): string {
  return from === to ? String(from) : `${from}–${to}`;
}

/** Russian plural forms: 1 год, 2 года, 5 лет (11–14 always take the third form). */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** The genitive after a numeral phrase ("в возрасте 21 года", "в возрасте 22 лет"): the singular only for 1, 21, 31… but not 11. */
export function pluralRuGenitive(n: number, forms: readonly [string, string]): string {
  const abs = Math.abs(n);
  return abs % 10 === 1 && abs % 100 !== 11 ? forms[0] : forms[1];
}
