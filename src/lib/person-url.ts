/**
 * Person page URLs: `/person/<id>-<slug>` (spec §6.1). The slug is derived from the name, kept in
 * Cyrillic (the browser and the sitemap percent-encode it) and never trusted: the id alone
 * identifies the record and a wrong slug redirects to the canonical one.
 * No imports, so client components and route handlers can share it.
 */
const MAX_SLUG = 80;
const MAX_ID = 2_147_483_647;

export function personSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return Array.from(slug).slice(0, MAX_SLUG).join("").replace(/-+$/, "");
}

export function personPath(id: number, name: string): string {
  const slug = personSlug(name);
  return slug ? `/person/${id}-${slug}` : `/person/${id}`;
}

export function parsePersonParam(param: string): { id: number; slug: string } | null {
  const match = /^(\d{1,10})(?:-([\s\S]*))?$/.exec(param);
  if (!match) return null;
  const id = Number(match[1]);
  if (id < 1 || id > MAX_ID) return null;
  return { id, slug: match[2] ?? "" };
}
