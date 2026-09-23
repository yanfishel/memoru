import { ActionIcon, Tooltip } from "@mantine/core";
import { IconBrandGithub, IconMail } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { getBuildInfo } from "@/db/queries";
import { getActiveServing } from "@/db/serving";
import { FISHART_URL, GITHUB_REPO_URL, mailtoHref } from "@/lib/external-links";
import { formatDateLong } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import { LogoLockup } from "./LogoLockup";
import styles from "./SiteFooter.module.css";

async function dataDate(): Promise<string | null> {
  try {
    const info = await getBuildInfo(await getActiveServing());
    return info?.dataDate ?? null;
  } catch {
    return null;
  }
}

export async function SiteFooter() {
  const date = await dataDate();
  const year = new Date().getFullYear();
  return (
    <footer className={`${styles.footer} no-print`}>
      <div className={styles.columns}>
        <div className={styles.column}>
          <Link href="/" className={styles.brand} aria-label={UI.siteTitle}>
            <LogoLockup size={22} />
          </Link>
          <p className={styles.description}>
            {UI.footer.copyright(year)} {UI.footer.description}
          </p>
        </div>
        <div className={styles.column}>
          <ul className={styles.list}>
            <li><Link href="/search">{UI.nav.search}</Link></li>
            <li><Link href="/explore">{UI.nav.explore}</Link></li>
            <li><Link href="/explore?view=map">{UI.nav.map}</Link></li>
            <li><Link href="/about">{UI.footer.about}</Link></li>
          </ul>
        </div>
        <div className={styles.column}>
          <span className={styles.heading}>{UI.footer.sourceHeading}</span>
          <ul className={styles.list}>
            <li>{UI.footer.sourceLabel} <a href="https://ru.openlist.wiki" rel="license noopener">{UI.footer.sourceName}</a></li>
            <li>{UI.footer.licenceLabel} <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ru" rel="license noopener">{UI.footer.licence}</a></li>
            <li>{UI.footer.dataDate(formatDateLong(date))}</li>
          </ul>
        </div>
      </div>
      <div className={styles.credits}>
        <a href={FISHART_URL} target="_blank" rel="noopener noreferrer" aria-label={UI.footer.fishart} className={styles.logo}>
          <Image src="/fishart.png" alt="fishart" width={90} height={21} className={styles.logoImage} />
        </a>
        <p className={styles.madeWith}>
          {UI.footer.madeWith} <span className={styles.heart} aria-hidden="true">♥</span> {UI.footer.madeFor}
        </p>
        <div className={styles.icons}>
          <Tooltip label={UI.footer.mail}>
            <ActionIcon component="a" href={mailtoHref(UI.footer.mailSubject)} variant="default" radius="xl" aria-label={UI.footer.mail}>
              <IconMail size={16} stroke={1.6} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={UI.footer.github}>
            <ActionIcon component="a" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" variant="default" radius="xl" aria-label={UI.footer.github}>
              <IconBrandGithub size={16} stroke={1.6} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
}
