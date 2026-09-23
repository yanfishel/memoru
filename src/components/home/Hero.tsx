import type { FeaturedPerson as Featured } from "@/db/queries";
import { SearchBox } from "@/components/SearchBox";
import { formatInt } from "@/lib/format";
import { UI } from "@/lib/ui-text";
import { FeaturedPerson } from "./FeaturedPerson";
import styles from "./home.module.css";

export function Hero({ persons, featured }: { persons: number; featured: Featured | null }) {
  return (
    <section className={styles.hero}>
      <div>
        <h1>
          {UI.home.title}
          <br />
          <span className={styles.accentWord}>{UI.home.titleAccent}</span>
        </h1>
        <p className={styles.lead}>{UI.home.lead(formatInt(persons))}</p>
        <SearchBox />
      </div>
      {featured && <FeaturedPerson person={featured} />}
    </section>
  );
}
