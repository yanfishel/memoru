"use client";

import { Popover } from "@mantine/core";
import { useState } from "react";
import type { LabelMap } from "@/db/queries";
import type { Dimension } from "@/lib/dimensions";
import type { Facets, FilterChange } from "@/lib/explore-state";
import type { FilterState } from "@/lib/filters";
import { UI } from "@/lib/ui-text";
import { DimensionEditor } from "./DimensionEditor";
import styles from "./filter-bar.module.css";

export function AddFilterPopover({ dimension, filters, facets, labels, onChange }: { dimension: Dimension; filters: FilterState; facets: Facets; labels: LabelMap; onChange: (change: FilterChange) => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} width={320} position="bottom-start" shadow="md" trapFocus returnFocus>
      <Popover.Target>
        <button type="button" className={styles.addChip} onClick={() => setOpened((o) => !o)} aria-expanded={opened} data-testid={`add-filter-${dimension.id}`}>
          {UI.explore.chips.add(dimension.titleRu)}
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <p className={styles.popoverTitle}>{dimension.titleRu}</p>
        <DimensionEditor dimension={dimension} filters={filters} facets={facets} labels={labels} onChange={onChange} />
      </Popover.Dropdown>
    </Popover>
  );
}
