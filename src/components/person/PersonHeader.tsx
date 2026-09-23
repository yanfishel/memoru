"use client";

import { Anchor, Badge, Breadcrumbs } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Badge as PersonBadge } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import styles from "./person.module.css";

const TONE: Record<PersonBadge["tone"], string> = { neutral: styles.badgeNeutral, accent: styles.badgeAccent, ok: styles.badgeOk, muted: styles.badgeMuted };

export function PersonHeader({ name, surname, years, badges, actions }: { name: string; surname: string; years: string | null; badges: PersonBadge[]; actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <Breadcrumbs separator="›" className={`${styles.crumbs} no-print`}>
        <Anchor component={Link} href="/search" size="sm">{UI.person.search}</Anchor>
        <Anchor component={Link} href={`/search?q=${encodeURIComponent(surname)}`} size="sm">{surname}</Anchor>
      </Breadcrumbs>
      <h1>{name}</h1>
      {years && <p className={`${styles.lifeYears} tnum`}>{years}</p>}
      <div className={styles.subhead}>
        <div className={styles.badges} data-testid="person-badges">
          {badges.map((b) => (
            <Badge key={b.key} variant="light" radius="sm" className={TONE[b.tone]}>{b.label}</Badge>
          ))}
        </div>
        {actions && <div className={`${styles.actions} no-print`}>{actions}</div>}
      </div>
    </header>
  );
}
