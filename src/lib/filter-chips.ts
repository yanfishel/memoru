/** The active filters as removable chips (spec §4.1). Browser-safe: type-only imports plus pure helpers. */
import type { LabelMap } from "@/db/queries";
import { UNKNOWN_KEYS } from "./charts";
import { DIMENSIONS } from "./dimensions";
import type { FilterChange } from "./explore-state";
import type { FilterState, YearFilter } from "./filters";
import { labelOf } from "./person-view";
import { UI } from "./ui-text";

export interface FilterChip {
  id: string;
  label: string;
  remove: FilterChange;
}

function yearText(year: YearFilter): string {
  const C = UI.explore.chips;
  let text = "";
  if (year.from !== undefined && year.to !== undefined) text = year.from === year.to ? String(year.from) : `${year.from}–${year.to}`;
  else if (year.from !== undefined) text = C.from(year.from);
  else if (year.to !== undefined) text = C.to(year.to);
  if (year.unknown) text = text ? `${text} ${C.unknownSuffix}` : UI.notStated;
  return text;
}

export function chipsFor(state: FilterState, labels: LabelMap): FilterChip[] {
  const chips: FilterChip[] = [];
  if (state.q) chips.push({ id: "q", label: UI.explore.chips.query(state.q), remove: { kind: "q", q: "" } });
  for (const dimension of DIMENSIONS) {
    const title = dimension.chipTitleRu ?? dimension.titleRu;
    if (dimension.kind === "year") {
      const year = state.years[dimension.id];
      if (!year) continue;
      chips.push({ id: dimension.id, label: `${title}: ${yearText(year)}`, remove: { kind: "year", dimension: dimension.id, year: {} } });
      continue;
    }
    // One chip per dimension, not per value: several selected codes join into one label ("Национальность:
    // русские, украинцы") in the order they already sit in state (never re-sorted), and its remove button
    // clears the whole dimension via the `codes: []` primitive.
    const codes = state.codes[dimension.id];
    if (codes && codes.length > 0) {
      // `unknown` and `unrecognized` read as one «неизвестно» value wherever in the list they sit — the
      // merged filter option (DimensionEditor.tsx) can select either or both, but the chip must not show
      // the pair as two separate values. Only the first occurrence is kept, so "unknown,unrecognized" and
      // "unrecognized,unknown" both collapse to a single «неизвестно» entry, in the position of whichever
      // came first.
      let mergedUnknown = false;
      const parts: string[] = [];
      for (const code of codes) {
        if (UNKNOWN_KEYS.has(code)) {
          if (!mergedUnknown) {
            parts.push(UI.notKnown);
            mergedUnknown = true;
          }
          continue;
        }
        parts.push(labelOf(labels, dimension.labelField, code));
      }
      // Semicolon, not comma: a value can contain its own comma ("ссылка, спецпоселение"), and a
      // comma-joined chip would read as one longer list (2026-09-18 review).
      chips.push({ id: dimension.id, label: `${title}: ${parts.join("; ")}`, remove: { kind: "codes", dimension: dimension.id, codes: [] } });
    }
  }
  return chips;
}
