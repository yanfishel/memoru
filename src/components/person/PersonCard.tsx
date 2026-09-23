import type { ReactNode } from "react";
import type { PersonData } from "@/lib/person";
import { photoUrl } from "@/lib/person-photo";
import { badgesFor, caseRows, fullName, lifeYears, narrativeParagraphs, openlistUrl, personJsonLd, personRows, sourceSegments, timelineFor, type Row } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import { PersonHeader } from "./PersonHeader";
import { PersonPhoto } from "./PersonPhoto";
import { SimilarRecords } from "./SimilarRecords";
import { Timeline } from "./Timeline";
import styles from "./person.module.css";

function Rows({ rows }: { rows: Row[] }) {
  // Coded fields carry "не указано" as a string (labelOf), raw dates and places carry null: both are missing.
  const isMissing = (r: Row) => r.value === null || r.value === UI.notStated;
  const present = rows.filter((r) => !isMissing(r));
  const missing = rows.filter(isMissing).map((r) => r.term.toLowerCase());
  return (
    <>
      <dl className={styles.rows}>
        {present.map((row) => (
          <RowPair key={row.term} row={row} />
        ))}
      </dl>
      {missing.length > 0 && <p className={styles.missingNote}>{UI.person.missing(missing.join(", "))}</p>}
    </>
  );
}

function RowPair({ row }: { row: Row }) {
  return (
    <>
      <dt>{row.term}</dt>
      <dd>
        {row.value}
        {row.note && <span className={styles.note}> ({row.note})</span>}
      </dd>
    </>
  );
}

/** Paper can't follow a link, so the printed address shows the Cyrillic slug as a reader would type it. */
function readableUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

export function PersonCard({ data, canonicalUrl, actions }: { data: PersonData; canonicalUrl: string; actions?: ReactNode }) {
  const { person, cases, labels, similar } = data;
  const name = fullName(person);
  const jsonLd = JSON.stringify(personJsonLd(person, canonicalUrl)).replace(/</g, "\\u003c");
  const source = person.sourceRaw ? sourceSegments(person.sourceRaw) : [];
  const paragraphs = narrativeParagraphs(person, cases, labels);
  // Photos are rare (1.3 % of records) and hot-linked from ru.openlist.wiki (spec §5, amended 2026-09-17).
  const photo = person.photoFile ? photoUrl(person.photoFile) : null;
  const caption = person.photoCaptionRaw ? sourceSegments(person.photoCaptionRaw) : [];
  return (
    <article className={styles.article}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PersonHeader name={name} surname={person.surname} years={lifeYears(person)} badges={badgesFor(person, cases)} actions={actions} />
      <div className={styles.narrativeBlock}>
        <div className={styles.narrative} data-testid="person-narrative">
          {paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        {photo && <PersonPhoto url={photo} alt={name} caption={caption} />}
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="details-title">
            <h2 id="details-title" className={styles.cardTitle}>{UI.person.details}</h2>
            <Rows rows={personRows(person, labels)} />
          </section>
          {cases.length === 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{UI.person.cases}</h2>
              <p className={styles.missing}>{UI.notStated}</p>
            </section>
          )}
          {cases.map((c) => (
            <section key={c.n} className={styles.card} aria-label={UI.person.caseN(c.n)}>
              <h2 className={styles.cardTitle}>{UI.person.caseN(c.n)}</h2>
              <Rows rows={caseRows(c, labels)} />
            </section>
          ))}
        </div>

        <aside className={styles.side}>
          <section className={styles.card} aria-labelledby="fate-title">
            <h2 id="fate-title" className={styles.cardTitle}>{UI.person.timeline.title}</h2>
            <Timeline steps={timelineFor(person, cases, labels)} />
          </section>
          <section className={styles.card} aria-labelledby="source-title">
            <h2 id="source-title" className={styles.cardTitle}>{UI.person.source}</h2>
            <p className={styles.source}>
              {source.length === 0 && <span className={styles.missing}>{UI.notStated}</span>}
              {source.map((segment, i) =>
                segment.href ? (
                  <a key={i} href={segment.href} rel="nofollow noopener">{segment.text}</a>
                ) : (
                  <span key={i}>{segment.text}</span>
                ),
              )}
            </p>
            <p>
              <a href={openlistUrl(person.openlistTitle)} rel="noopener">{UI.person.openlist}</a>
            </p>
            {/* Spec §5.1: the printed page carries its own address. */}
            <p className={`${styles.printUrl} print-only`} data-testid="print-url">
              {UI.person.text.link}: {readableUrl(canonicalUrl)}
            </p>
            <p className={styles.attribution}>
              {UI.person.corrections} {UI.person.licence}
            </p>
          </section>
          <SimilarRecords people={similar} />
        </aside>
      </div>
    </article>
  );
}
