"use client";

import { useWindowScroll } from "@mantine/hooks";
import Link from "next/link";
import { UI } from "@/lib/ui-text";
import { HeaderNav } from "./HeaderNav";
import { LogoLockup } from "./LogoLockup";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const [scroll] = useWindowScroll();
  return (
    <header className={`${styles.header} no-print`} data-scrolled={scroll.y > 8 ? "true" : undefined}>
      <div className={styles.inner}>
        {/* The mark is decorative (aria-hidden in LogoMark) and the wordmark is real, visible text;
            aria-label carries the full site name so the link's accessible name doesn't shrink to
            just "MEMOru". UI.siteTitle itself is untouched — it still drives the <title> template. */}
        <Link href="/" className={styles.title} aria-label={UI.siteTitle}>
          <LogoLockup size={25} />
        </Link>
        {/* No Suspense here: HeaderNav renders from the pathname alone and puts its own boundary around
            the one leaf that reads the query string, so the nav and the theme control are in the
            prerendered HTML of every static route. */}
        <HeaderNav />
      </div>
    </header>
  );
}
