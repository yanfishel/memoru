export interface ParsedTitle {
  surname: string;
  givenName: string | null;
  patronymic: string | null;
  titleYear: number | null;
}

const WITH_YEAR = /^(.*?)\s*\((\d{4})[^)]*\)\s*$/;

export function parseTitle(title: string): ParsedTitle {
  const clean = title.replace(/_/g, " ").trim();
  const match = WITH_YEAR.exec(clean);
  const name = match ? match[1] : clean;
  const titleYear = match ? Number(match[2]) : null;
  const tokens = name.split(/\s+/).filter(Boolean);
  return {
    surname: tokens[0] ?? "",
    givenName: tokens[1] ?? null,
    patronymic: tokens.length > 2 ? tokens.slice(2).join(" ") : null,
    titleYear,
  };
}
