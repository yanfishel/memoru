import Link from "next/link";
import { personPath } from "@/lib/person-url";
import type { SimilarPerson } from "@/lib/search";
import { UI } from "@/lib/ui-text";
import styles from "./person.module.css";

export function SimilarRecords({ people }: { people: SimilarPerson[] }) {
  if (people.length === 0) return null;
  return (
    <section className={`${styles.card} no-print`} data-testid="similar-records" aria-labelledby="similar-title">
      <h2 id="similar-title" className={styles.cardTitle}>{UI.person.similar.title}</h2>
      <p className={styles.hint}>{UI.person.similar.hint}</p>
      <ul className={styles.similar}>
        {people.map((p) => (
          <li key={p.id}>
            <Link href={personPath(p.id, p.name)}>{p.name}</Link>
            {p.birth_year !== null && <span className={`${styles.similarMeta} tnum`}>{p.birth_year}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
