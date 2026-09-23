import { UI } from "@/lib/ui-text";

/**
 * The header navigation model, kept free of React and Mantine so the active-link rule is a pure
 * function the unit tests can exercise on its own.
 */
export interface NavLink {
  href: string;
  label: string;
  /** Active when the pathname matches and, if given, the `view` query parameter matches too. */
  path: string;
  view?: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/search", label: UI.nav.search, path: "/search" },
  { href: "/explore", label: UI.nav.explore, path: "/explore" },
  { href: "/explore?view=map", label: UI.nav.map, path: "/explore", view: "map" },
];

/**
 * Which link is the current page. `view` is only ever non-null on `/explore`, the one route that
 * reads the query parameter; every other route passes `null` so the header can render without
 * `useSearchParams` and therefore stays in the statically prerendered HTML.
 */
export function activeHref(pathname: string, view: string | null): string | null {
  const match = NAV_LINKS.filter((l) => l.path === pathname);
  if (match.length === 0) return null;
  return (match.find((l) => l.view === (view ?? undefined)) ?? match.find((l) => l.view === undefined) ?? match[0]).href;
}
