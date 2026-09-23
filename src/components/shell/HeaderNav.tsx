"use client";

import { Burger, Drawer, Stack, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { UI } from "@/lib/ui-text";
import { LogoLockup } from "./LogoLockup";
import { activeHref, NAV_LINKS } from "./nav-links";
import styles from "./SiteHeader.module.css";
import { ThemeMenu } from "./ThemeMenu";

const EXPLORE_PATH = "/explore";

/** Pure renderer: the same list of links for the header bar and the drawer. */
function NavLinks({ pathname, view, onNavigate }: { pathname: string; view: string | null; onNavigate: () => void }) {
  const active = activeHref(pathname, view);
  return (
    <>
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={active === l.href ? "page" : undefined} onClick={onNavigate}>
          {l.label}
        </Link>
      ))}
    </>
  );
}

/**
 * The only component that reads the query string, mounted only on `/explore` (a dynamic route) and
 * only under a Suspense boundary — so the statically prerendered routes never bail out to the
 * client and still ship the whole header in their HTML.
 */
function ExploreNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const view = useSearchParams().get("view");
  return <NavLinks pathname={EXPLORE_PATH} view={view} onNavigate={onNavigate} />;
}

export function HeaderNav() {
  const pathname = usePathname();
  const [opened, { toggle, close }] = useDisclosure(false);

  // On `/explore` the active item depends on `?view`; everywhere else the pathname alone decides it,
  // and the links render straight into the server HTML. The fallback is the same list with no view.
  const links =
    pathname === EXPLORE_PATH ? (
      <Suspense fallback={<NavLinks pathname={pathname} view={null} onNavigate={close} />}>
        <ExploreNavLinks onNavigate={close} />
      </Suspense>
    ) : (
      <NavLinks pathname={pathname} view={null} onNavigate={close} />
    );

  return (
    <>
      <nav className={styles.nav} aria-label="Основная навигация">
        {links}
      </nav>
      <div className={styles.tools}>
        <ThemeMenu />
        <Tooltip label={UI.nav.menu}>
          <Burger className={styles.burger} opened={opened} onClick={toggle} aria-label={UI.nav.menu} size="sm" />
        </Tooltip>
      </div>
      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="xs"
        // The lockup replaces the word "Меню" as the visible title (2026-09-18 review). The mark
        // is decorative and the wordmark's own visible text would otherwise give the drawer's
        // aria-labelledby just "MEMOru" — the aria-label on this wrapper gives it the full site
        // name instead, the same string the header's own logo link uses.
        title={
          <span className={styles.drawerTitle} aria-label={UI.siteTitle}>
            <LogoLockup size={22} />
          </span>
        }
      >
        <Stack gap="md" className={styles.drawerLinks}>
          {links}
        </Stack>
      </Drawer>
    </>
  );
}
