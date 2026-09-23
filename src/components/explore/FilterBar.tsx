"use client";

import { Button } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type { LabelMap } from "@/db/queries";
import { dimensionById, type DimensionId } from "@/lib/dimensions";
import type { Facets, FilterChange } from "@/lib/explore-state";
import type { FilterState } from "@/lib/filters";
import { formatInt } from "@/lib/format";
import { UI } from "@/lib/ui-text";
import { AddFilterPopover } from "./AddFilterPopover";
import { FilterChips } from "./FilterChips";
import { FilterDrawer } from "./FilterDrawer";
import styles from "./filter-bar.module.css";

/** The four dimensions that get their own add-chip; everything else is one click further, in the drawer. */
export const QUICK_DIMENSIONS: DimensionId[] = ["nationality", "sentence_type", "source_region", "arrest_year"];

export function FilterBar({
  filters,
  facets,
  labels,
  total,
  onChange,
  onReset,
}: {
  filters: FilterState;
  facets: Facets;
  labels: LabelMap;
  /** null while search is unavailable. */
  total: number | null;
  onChange: (change: FilterChange) => void;
  onReset: () => void;
}) {
  const [drawer, setDrawer] = useState(false);
  const hasFilters = Object.keys(filters.codes).length + Object.keys(filters.years).length > 0 || filters.q !== "";
  return (
    <section className={styles.bar} aria-label={UI.explore.chips.allFilters}>
      <div className={styles.tools}>
        {total !== null && (
          <span className={styles.total}>
            {UI.explore.found(formatInt(total))}
          </span>
        )}
        <Button variant="default" size="sm" leftSection={<IconAdjustmentsHorizontal size={16} stroke={1.6} />} onClick={() => setDrawer(true)} data-testid="all-filters">
          {UI.explore.chips.allFilters}
        </Button>
      </div>
      <div className={styles.chips}>
        {/* `.chips` centres each flex line's items, so with several rows of chips this label
            stays centred against the first row rather than the block as a whole. */}
        <span className={styles.chipsLabel}>{UI.explore.chips.chipsLabel}</span>
        <FilterChips filters={filters} labels={labels} onChange={onChange} />
        {QUICK_DIMENSIONS.map((id) => (
          <AddFilterPopover key={id} dimension={dimensionById(id)!} filters={filters} facets={facets} labels={labels} onChange={onChange} />
        ))}
        <button type="button" className={styles.addChip} onClick={() => setDrawer(true)}>{UI.explore.chips.more}</button>
        {hasFilters && (
          <button type="button" className={styles.clear} onClick={onReset} data-testid="clear-filters">
            <IconX size={13} stroke={2} aria-hidden="true" />
            {UI.explore.chips.clearAll}
          </button>
        )}
      </div>
      <FilterDrawer opened={drawer} onClose={() => setDrawer(false)} filters={filters} facets={facets} labels={labels} onChange={onChange} onReset={onReset} />
    </section>
  );
}
