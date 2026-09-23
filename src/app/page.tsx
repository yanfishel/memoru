import { Hero } from "@/components/home/Hero";
import { StatCards } from "@/components/home/StatCards";
import { Story } from "@/components/home/Story";
import { loadHomeData } from "@/lib/home";
import { websiteJsonLd } from "@/lib/site-jsonld";
import { siteUrl } from "@/lib/site-url";
import styles from "@/components/home/home.module.css";

// Rendered per request, not prerendered: prerendering would run at `next build`, where there is no
// database to query (spec §4.1 — the server never runs the ETL, and the image build has none
// either). `loadHomeData` keeps its own hourly memo so this doesn't mean a query per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadHomeData();
  // Escaped the same way the person page escapes its JSON-LD: a "<" inside a script body would let
  // a stray "</script>" out of the block.
  const jsonLd = JSON.stringify(websiteJsonLd(siteUrl())).replace(/</g, "\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className={styles.heroBand}>
        <Hero persons={data.summary.persons ?? 0} featured={data.featured} />
        <StatCards summary={data.summary} />
      </div>
      <Story data={data} />
    </>
  );
}
