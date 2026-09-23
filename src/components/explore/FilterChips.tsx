"use client";

import { Pill, Tooltip } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import type { LabelMap } from "@/db/queries";
import type { FilterChange } from "@/lib/explore-state";
import { chipsFor } from "@/lib/filter-chips";
import type { FilterState } from "@/lib/filters";
import styles from "./filter-bar.module.css";

/**
 * Shows the tooltip only when `.chipLabel`'s `max-width: 18rem` (filter-bar.module.css) actually clips
 * the text. Grouped chips make label length vary a lot — a dimension with several selected values can
 * overflow well under 40 characters (a 2026-09-18 measurement found a 39-character label already 5px
 * past its box, ellipsised with no tooltip) while a single long value can fit inside 18rem with room to
 * spare, so a fixed character count is both a false negative and a false positive. Measuring the actual
 * overflow (`scrollWidth` vs `clientWidth`) is exact instead of an approximation of one.
 */
function ChipLabel({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [label]);
  return (
    <Tooltip label={label} disabled={!truncated}>
      <span ref={ref} className={styles.chipLabel}>{label}</span>
    </Tooltip>
  );
}

export function FilterChips({ filters, labels, onChange }: { filters: FilterState; labels: LabelMap; onChange: (change: FilterChange) => void }) {
  const chips = chipsFor(filters, labels);
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((chip) => (
        <Pill
          key={chip.id}
          size="md"
          className={styles.chip}
          data-testid="filter-chip"
          withRemoveButton
          onRemove={() => onChange(chip.remove)}
          removeButtonProps={{ "aria-label": `Убрать фильтр ${chip.label}`, "aria-hidden": false, tabIndex: 0 }}
        >
          <ChipLabel label={chip.label} />
        </Pill>
      ))}
    </>
  );
}
