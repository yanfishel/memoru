"use client";

import { Skeleton } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LabelMap } from "@/db/queries";
import { barOption, histogramOption, pieOption } from "@/lib/charts";
import { dimensionById, type DimensionId } from "@/lib/dimensions";
import { facetSlices, type Facets } from "@/lib/explore-state";
import { formatInt } from "@/lib/format";
import { UI } from "@/lib/ui-text";
import { EChart } from "../charts/EChart";
import { usePalette } from "../charts/usePalette";
import styles from "./explore.module.css";

function dim(id: DimensionId) {
  return dimensionById(id)!;
}

/** A horizontal bar chart needs height per row, not a fixed box: a long label wraps to two lines, and
 * at the default height "Образование" and "Партийность" ran their labels into each other. */
function barHeight(rows: number): number {
  return Math.max(300, Math.round(rows * 38 + 100));
}

/** The caption sits under the card, not inside it, the way the home page's chapters read. */
function Card({ title, caveat, note, wide, pending, children }: { title: string; caveat?: string | null; note?: string; wide?: boolean; pending: boolean; children: ReactNode }) {
  return (
    <div className={wide ? styles.cellWide : styles.cell}>
      <section className={wide ? styles.cardWide : styles.card} aria-label={title} aria-busy={pending}>
        {pending ? <Skeleton height={wide ? 320 : 300} radius="md" /> : children}
      </section>
      {(caveat || note) && (
        <p className={styles.note}>
          {[note, caveat].filter(Boolean).join(" ")} <Link href="/about">{UI.chart.more}</Link>
        </p>
      )}
    </div>
  );
}

export function ChartsView({ facets, labels, total, pending }: { facets: Facets; labels: LabelMap; total: number; pending: boolean }) {
  const { palette, unknown, accent } = usePalette();
  const chartOf = (id: DimensionId, options: { top?: number; dropUnknown?: boolean; mergeUnknown?: boolean } = {}) =>
    facetSlices(dim(id), facets, labels, options);
  // §1 addendum: same merge as the home pie, for the same reason — this is where the "Цифры" page
  // draws "Пол" from, and the truncation/crossing-leader-line problem is the same at any width.
  const sex = chartOf("sex", { mergeUnknown: true });
  const sentence = chartOf("sentence_type", { dropUnknown: true });
  // The maintainer asked for these four to drop the unknown rows (2026-09-18 review): absolute
  // counts, so the kept bars keep their meaning, and the caveat switches to the "omitted" wording.
  const age = chartOf("age_at_arrest", { dropUnknown: true });
  const nationality = chartOf("nationality", { top: 10, dropUnknown: true });
  const education = chartOf("education", { dropUnknown: true });
  // 24 party values, most of them a few dozen records: the tail folds into "другие" like nationality.
  const party = chartOf("party", { top: 10, dropUnknown: true });
  // Each side-by-side pair shares one height — the taller of the two — so the cards end level.
  const pairHeight = barHeight(Math.max(education.slices.length, party.slices.length));
  // The pie has no rows of its own: it takes the sentence chart's height, which the pair sits beside.
  const topPairHeight = barHeight(sentence.slices.length);
  const arrestRows = Object.entries(facets.arrest_year ?? {}).map(([key, count]) => ({ key, count }));
  const arrests = histogramOption(dim("arrest_year").titleRu, arrestRows, dim("arrest_year").yearRange!, accent);
  // Meilisearch leaves null values out of a facet distribution, so the records the year facet does not
  // account for are exactly the ones without an arrest year.
  const arrestKnown = arrestRows.reduce((sum, row) => sum + row.count, 0);
  const arrestUnknown = Math.max(0, total - arrestKnown);

  return (
    <div className={styles.grid}>
      <Card title={dim("arrest_year").titleRu} wide pending={pending} note={`${UI.chart.firstCaseRule} ${UI.notStatedCap}: ${formatInt(arrestUnknown)}.`}>
        <EChart option={arrests.option} ariaLabel={dim("arrest_year").titleRu} />
      </Card>
      <Card title={dim("sex").titleRu} pending={pending}>
        <EChart option={pieOption(dim("sex").titleRu, sex.slices, palette, unknown)} height={topPairHeight} ariaLabel={dim("sex").titleRu} />
      </Card>
      <Card title={dim("sentence_type").titleRu} pending={pending} caveat={sentence.caveat}>
        <EChart option={barOption(dim("sentence_type").titleRu, sentence.slices, palette, unknown)} height={topPairHeight} ariaLabel={dim("sentence_type").titleRu} />
      </Card>
      <Card title={dim("age_at_arrest").titleRu} pending={pending} caveat={age.caveat}>
        <EChart option={barOption(dim("age_at_arrest").titleRu, age.slices, palette, unknown)} height={barHeight(age.slices.length)} ariaLabel={dim("age_at_arrest").titleRu} />
      </Card>
      <Card title={dim("nationality").titleRu} pending={pending} caveat={nationality.caveat}>
        <EChart option={barOption(dim("nationality").titleRu, nationality.slices, palette, unknown)} height={barHeight(nationality.slices.length)} ariaLabel={dim("nationality").titleRu} />
      </Card>
      <Card title={dim("education").titleRu} pending={pending} caveat={education.caveat}>
        <EChart option={barOption(dim("education").titleRu, education.slices, palette, unknown)} height={pairHeight} ariaLabel={dim("education").titleRu} />
      </Card>
      <Card title={dim("party").titleRu} pending={pending} caveat={party.caveat}>
        <EChart option={barOption(dim("party").titleRu, party.slices, palette, unknown, { labelTinyBars: true })} height={pairHeight} ariaLabel={dim("party").titleRu} />
      </Card>
    </div>
  );
}
