"use client";

import Link from "next/link";
import { useMemo } from "react";
import { barOption, histogramOption, pieOption, unknownCount } from "@/lib/charts";
import { dimensionById } from "@/lib/dimensions";
import { formatInt, formatShareWords } from "@/lib/format";
import type { HomeData } from "@/lib/home";
import { ARRESTS_TAIL_THRESHOLD, executedConfirmedCount, trimmedYearRange } from "@/lib/home-view";
import { UI } from "@/lib/ui-text";
import { Choropleth } from "../charts/Choropleth";
import { EChart } from "../charts/EChart";
import { usePalette } from "../charts/usePalette";
import { Reveal } from "./Reveal";
import styles from "./home.module.css";

export function Story({ data }: { data: HomeData }) {
  const { palette, unknown, accent, rule } = usePalette();
  const T = UI.home.story;
  // Home page only (spec: the "Цифры" page keeps the full yearRange) — trims the trailing years where
  // arrests thin out to a sub-pixel line against the 1937 peak; UI.home.story.terror.tailNote below
  // tells the reader the full period is still on the "Цифры" page.
  const arrestRange = useMemo(
    () => trimmedYearRange(data.arrestsByYear.rows, dimensionById("arrest_year")!.yearRange!, ARRESTS_TAIL_THRESHOLD),
    [data.arrestsByYear.rows],
  );
  const arrests = useMemo(
    () => histogramOption(T.terror.chart, data.arrestsByYear.rows, arrestRange, accent, { years: [data.terror.from, data.terror.to], dim: rule }),
    [T.terror.chart, data.arrestsByYear.rows, arrestRange, data.terror.from, data.terror.to, accent, rule],
  );
  const regionNames = useMemo(() => new Map(data.regionNames), [data.regionNames]);
  const executedConfirmed = executedConfirmedCount(data.summary);
  const unknownRegion = unknownCount(data.sourceRegion);

  return (
    <section className={styles.story}>
      <h2>{T.title}</h2>

      <Reveal className={styles.chapter}>
        <div className={styles.chapterText}>
          <h3>{T.terror.heading(data.terror.from, data.terror.to)}</h3>
          <p>{T.terror.text(formatShareWords(data.terror.share), formatInt(data.terror.inRange))}</p>
          {/* Every chart caveat ends in a link to the method notes (spec §3.5). The rule sentence and
              the "not stated" count read as two separate lines, like the about page's own paragraph
              arrays (about/page.tsx) — structural <p> siblings, not a <br> inside one sentence. */}
          <div className={styles.note}>
            <p>{UI.chart.firstCaseRule}</p>
            <p>{T.terror.tailNote}</p>
            <p>
              {UI.notStatedCap}: {formatInt(data.arrestsByYear.unknownCount)}.{" "}
              <Link href="/about">{UI.chart.more}</Link>
            </p>
          </div>
          <Link href="/explore?view=charts">{T.terror.link}</Link>
        </div>
        <div className={styles.chapterChart}>
          <EChart option={arrests.option} ariaLabel={T.terror.chart} />
        </div>
      </Reveal>

      <Reveal className={styles.chapter}>
        <div className={styles.chapterText}>
          <h3>{T.sentences.heading}</h3>
          {/* `executed_confirmed` is a newer aggregate key (scripts/etl/db/serving.sql); an older
              serving schema has no such row in agg_summary, so T.sentences.text omits the confirmed-
              executions sentence (executedConfirmedCount returns null) rather than showing a false
              zero — the paragraph then ends after "исхода." with no dangling text. */}
          <p>{T.sentences.text(executedConfirmed !== null ? formatInt(executedConfirmed) : null)}</p>
          <p>{T.sentences.sexText}</p>
          {data.sentence.caveat && (
            <p className={styles.note}>
              {data.sentence.caveat} <Link href="/about">{UI.chart.more}</Link>
            </p>
          )}
          <Link href="/explore?view=charts">{T.sentences.link}</Link>
        </div>
        <div className={`${styles.chapterChart} ${styles.pair}`}>
          <EChart option={barOption(T.sentences.sentence, data.sentence.slices, palette, unknown)} ariaLabel={T.sentences.sentence} />
          <EChart option={pieOption(T.sentences.sex, data.sex.slices, palette, unknown)} ariaLabel={T.sentences.sex} />
        </div>
      </Reveal>

      <Reveal className={`${styles.chapter} ${styles.chapterWide}`}>
        <div className={styles.chapterText}>
          <h3>{T.geography.heading}</h3>
        </div>
        {/* The map comes right after the heading, with no prose between them — the caption below it
            carries the text instead. showNote={false}: Choropleth's own figcaption (boundaries,
            collapse and the unmatched count) would otherwise repeat what this chapter prints itself
            just below; the "Цифры" page's own Choropleth call (MapView.tsx) is untouched and keeps
            that figcaption. */}
        <div className={styles.chapterChart}>
          <Choropleth layer="regions" rows={data.sourceRegion} title={T.geography.map} names={regionNames} showNote={false} />
        </div>
        <div className={styles.chapterText}>
          <p>{T.geography.text}</p>
          <div className={styles.note}>
            <p>{T.geography.note}</p>
            <p>
              {T.geography.unknownLabel}: {formatInt(unknownRegion)}.{" "}
              <Link href="/about">{UI.chart.more}</Link>
            </p>
          </div>
          <Link href="/explore?view=map">{T.geography.link}</Link>
        </div>
      </Reveal>
    </section>
  );
}
