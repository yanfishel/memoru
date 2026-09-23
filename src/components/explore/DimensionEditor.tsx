"use client";

import { Checkbox, NumberInput, RangeSlider, ScrollArea, Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { LabelMap } from "@/db/queries";
import type { Dimension } from "@/lib/dimensions";
import { facetSlices, isSliceChecked, toggleSlice, type Facets, type FilterChange } from "@/lib/explore-state";
import type { FilterState, YearFilter } from "@/lib/filters";
import { formatInt } from "@/lib/format";
import { UI } from "@/lib/ui-text";
import styles from "./filter-bar.module.css";

function CodeEditor({ dimension, filters, facets, labels, onChange }: EditorProps) {
  const [needle, setNeedle] = useState("");
  const selected = filters.codes[dimension.id] ?? [];
  // `mergeUnknown`: "unknown" ("не указано") and "unrecognized" ("не распознано") show as one
  // «неизвестно» option, derived from whichever of the two the data actually has for this dimension —
  // never hard-coded per dimension (spec brief §2). The slice itself carries which underlying codes it
  // represents; `isSliceChecked`/`toggleSlice` (explore-state.ts) read and write all of them at once.
  const slices = useMemo(() => facetSlices(dimension, facets, labels, { mergeUnknown: true }).slices, [dimension, facets, labels]);
  const shown = needle ? slices.filter((s) => s.label.toLowerCase().includes(needle.toLowerCase())) : slices;
  return (
    <Stack gap="xs">
      {slices.length > 8 && (
        <TextInput
          size="xs"
          value={needle}
          onChange={(event) => setNeedle(event.currentTarget.value)}
          placeholder={UI.explore.chips.valueSearch}
          aria-label={`${dimension.titleRu}: ${UI.explore.chips.valueSearch}`}
          leftSection={<IconSearch size={14} stroke={1.6} />}
        />
      )}
      <ScrollArea.Autosize mah={280} type="auto">
        <Stack gap={4}>
          {shown.map((slice) => (
            <Checkbox
              key={slice.key}
              size="sm"
              checked={isSliceChecked(slice, selected)}
              onChange={(event) =>
                onChange({ kind: "codes", dimension: dimension.id, codes: toggleSlice(selected, slice, event.currentTarget.checked) })
              }
              label={
                <span className={styles.optionLabel}>
                  <span>{slice.label}</span>
                  <span className={`${styles.count} tnum`}>{formatInt(slice.count)}</span>
                </span>
              }
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function YearEditor({ dimension, filters, onChange }: EditorProps) {
  const [min, max] = dimension.yearRange ?? [1800, 2030];
  const value = filters.years[dimension.id];
  const from = value?.from ?? min;
  const to = value?.to ?? max;
  // Mantine clamps the input itself on blur, so a year outside the dimension's range is clamped here too
  // rather than discarded: the field and the filter then agree, and a bound equal to `min`/`max` drops out
  // through the `commit` rule below. Anything that is not a four-digit year still clears the bound.
  const yearOf = (text: string) => (/^\d{4}$/.test(text) ? Math.min(max, Math.max(min, Number(text))) : undefined);
  const commit = (part: Partial<YearFilter>) => {
    const next: YearFilter = { ...value, ...part };
    // The full range means "no year filter": drop the bounds so the chip and the URL stay clean.
    if (next.from === min) delete next.from;
    if (next.to === max) delete next.to;
    onChange({ kind: "year", dimension: dimension.id, year: next });
  };
  return (
    <Stack gap="sm">
      {/* Uncontrolled and keyed on the committed range: the thumbs move freely while dragging, commit on release,
          and a change from elsewhere (a chip removed, a reset) re-mounts them at the new bounds. */}
      <RangeSlider
        key={`${from}-${to}`}
        min={min}
        max={max}
        step={1}
        minRange={0}
        defaultValue={[from, to]}
        onChangeEnd={([f, t]) => commit({ from: f, to: t })}
        label={(v) => String(v)}
        thumbFromLabel={`${dimension.titleRu}: ${UI.explore.yearFrom}`}
        thumbToLabel={`${dimension.titleRu}: ${UI.explore.yearTo}`}
        marks={[{ value: min, label: String(min) }, { value: max, label: String(max) }]}
        className={styles.slider}
      />
      <div className={styles.yearInputs}>
        <NumberInput
          key={`from-${value?.from ?? ""}`}
          size="xs"
          min={min}
          max={max}
          defaultValue={value?.from ?? ""}
          placeholder={String(min)}
          aria-label={`${dimension.titleRu}: ${UI.explore.yearFrom}`}
          onBlur={(event) => commit({ from: yearOf(event.currentTarget.value) })}
          hideControls
        />
        <span aria-hidden="true">—</span>
        <NumberInput
          key={`to-${value?.to ?? ""}`}
          size="xs"
          min={min}
          max={max}
          defaultValue={value?.to ?? ""}
          placeholder={String(max)}
          aria-label={`${dimension.titleRu}: ${UI.explore.yearTo}`}
          onBlur={(event) => commit({ to: yearOf(event.currentTarget.value) })}
          hideControls
        />
      </div>
      <Checkbox size="sm" checked={value?.unknown ?? false} onChange={(event) => commit({ unknown: event.currentTarget.checked })} label={UI.notKnown} />
    </Stack>
  );
}

export interface EditorProps {
  dimension: Dimension;
  filters: FilterState;
  facets: Facets;
  labels: LabelMap;
  onChange: (change: FilterChange) => void;
}

export function DimensionEditor(props: EditorProps) {
  return props.dimension.kind === "year" ? <YearEditor {...props} /> : <CodeEditor {...props} />;
}
