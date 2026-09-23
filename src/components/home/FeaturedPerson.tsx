import { Paper } from "@mantine/core";
import Link from "next/link";
import type { FeaturedPerson as Featured } from "@/db/queries";
import { PersonPhoto } from "@/components/person/PersonPhoto";
import { isFeminine } from "@/lib/home-view";
import { photoUrl } from "@/lib/person-photo";
import { personPath } from "@/lib/person-url";
import { formatDate, fullName } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import styles from "./home.module.css";

export function FeaturedPerson({ person }: { person: Featured }) {
  const name = fullName(person);
  const arrest = formatDate({ year: person.arrestYear, month: person.arrestMonth, day: person.arrestDay, precision: person.arrestDatePrecision });
  // Built server-side (person-photo.ts is server-only) and passed down as a plain string.
  const photo = photoUrl(person.photoFile);
  // `person-view.ts`'s own `genderOf`/`pick` are module-private and take a full `PersonRecord`,
  // which `FeaturedPerson` isn't — `isFeminine` (home-view.ts) restates just the rule, kept as a
  // one-liner there rather than exporting person-view.ts's helpers for a single bare `sex` field.
  const f = isFeminine(person.sex);
  const S = UI.home.featured.steps;
  // Exactly four steps, always: getFeaturedPerson's WHERE guarantees a birth year, an arrest year,
  // a conviction year and an ending (a death year, or else a rehabilitation year) — never fewer,
  // so this never conditionally omits a step the way earlier rounds did.
  const ending = person.deathYear !== null
    ? { year: person.deathYear, label: S.death }
    : { year: person.rehabYear as number, label: S.rehab };
  const steps: Array<{ year: number; label: string; accent?: boolean }> = [
    { year: person.birthYear, label: f ? S.bornF : S.born },
    { year: person.arrestYear, label: S.arrest, accent: true },
    { year: person.convictionYear, label: S.verdict },
    ending,
  ];

  return (
    // The whole card is one link: `Link` (a Client Component reference) is rendered as a child here,
    // not passed as a `component` prop value, so this stays a Server Component — passing a component
    // *type* as a prop across the Server/Client boundary is what RSC serialisation rejects, not
    // rendering it as an element.
    <Link href={personPath(person.id, name)} className={styles.featured}>
      <Paper className={styles.featuredCard} withBorder radius="md" p="lg">
        <span className={styles.featuredLabel}>{UI.home.featured.label}</span>
        <div className={styles.featuredTop}>
          <div className={styles.featuredInfo}>
            <span className={styles.featuredName}>{name}</span>
            <span className={styles.featuredLine}>
              {UI.home.featured.born(person.birthYear, person.birthPlaceRaw)}. {arrest && (f ? UI.home.featured.arrestedF(arrest) : UI.home.featured.arrested(arrest))}
            </span>
          </div>
          {/* `.featuredPhoto` is a fixed-size frame (home.module.css) independent of PersonPhoto's
              own content, so the frame — and the card's height — stays put even when the image
              fails to load and PersonPhoto renders nothing inside it: keeping the empty frame
              (over collapsing it) is the choice that actually serves round 4's point, a card whose
              height never jumps between reloads. Collapsing only on failure would trade a rare,
              already-invisible-to-most-visitors case for reintroducing exactly the instability this
              round exists to remove. */}
          <div className={styles.featuredPhoto}>
            <PersonPhoto url={photo} alt={name} />
          </div>
        </div>
        {/* Not aria-hidden: the death/rehabilitation year appears nowhere else, so screen readers need it. */}
        <span className={styles.timeline}>
          {steps.map((step) => (
            <span key={step.label} className={step.accent ? styles.stepAccent : styles.step}>
              <b className="tnum">{step.year}</b>
              <span>{step.label}</span>
            </span>
          ))}
        </span>
      </Paper>
    </Link>
  );
}
