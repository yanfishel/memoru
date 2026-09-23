export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "")
    .trim();
}
