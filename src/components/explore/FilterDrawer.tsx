"use client";

import { Accordion, Button, Drawer, NativeScrollArea } from "@mantine/core";
import type { LabelMap } from "@/db/queries";
import { DIMENSIONS } from "@/lib/dimensions";
import type { Facets, FilterChange } from "@/lib/explore-state";
import type { FilterState } from "@/lib/filters";
import { UI } from "@/lib/ui-text";
import { DimensionEditor } from "./DimensionEditor";
import styles from "./filter-bar.module.css";

export function FilterDrawer({
  opened,
  onClose,
  filters,
  facets,
  labels,
  onChange,
  onReset,
}: {
  opened: boolean;
  onClose: () => void;
  filters: FilterState;
  facets: Facets;
  labels: LabelMap;
  onChange: (change: FilterChange) => void;
  onReset: () => void;
}) {
  const active = DIMENSIONS.filter((d) => (filters.codes[d.id]?.length ?? 0) > 0 || filters.years[d.id] !== undefined).map((d) => d.id);
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title={UI.explore.chips.allFilters} scrollAreaComponent={NativeScrollArea}>
      <div className={styles.drawerActions}>
        <Button variant="subtle" size="xs" onClick={onReset} data-testid="clear-filters-drawer">{UI.explore.chips.clearAll}</Button>
        <Button size="xs" onClick={onClose}>{UI.explore.chips.apply}</Button>
      </div>
      <Accordion multiple defaultValue={active} variant="separated" radius="md">
        {DIMENSIONS.map((dimension) => (
          <Accordion.Item key={dimension.id} value={dimension.id}>
            <Accordion.Control>{dimension.titleRu}</Accordion.Control>
            <Accordion.Panel>
              <DimensionEditor dimension={dimension} filters={filters} facets={facets} labels={labels} onChange={onChange} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {/* Repeats the top pair after the last filter (2026-09-18): a reader who has scrolled down the
          whole list does not have to scroll back up to reset or apply. Same components, same handlers,
          same order as the top pair — not a sticky bar, which would cover the last filter's own controls
          while scrolling past them. */}
      <div className={styles.drawerActions}>
        <Button variant="subtle" size="xs" onClick={onReset} data-testid="clear-filters-drawer">{UI.explore.chips.clearAll}</Button>
        <Button size="xs" onClick={onClose}>{UI.explore.chips.apply}</Button>
      </div>
    </Drawer>
  );
}
