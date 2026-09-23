import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { UI } from "@/lib/ui-text";
import styles from "./about.module.css";

export const metadata: Metadata = pageMetadata({
  title: UI.about.title,
  description: UI.about.lead,
  path: "/about",
  type: "article",
});

export default function About() {
  return (
    <article className={styles.about}>
      <h1>{UI.about.title}</h1>
      <p className={styles.lead}>{UI.about.lead}</p>
      {UI.about.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.text.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
