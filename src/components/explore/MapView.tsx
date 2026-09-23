"use client";

import { SegmentedControl } from "@mantine/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LabelMap } from "@/db/queries";
import { dimensionById } from "@/lib/dimensions";
import type { Facets, FilterChange } from "@/lib/explore-state";
import { formatInt } from "@/lib/format";
import { unknownCount } from "@/lib/charts";
import { codesForPolygon, type MapLayer } from "@/lib/map";
import { UI } from "@/lib/ui-text";
import { Choropleth } from "../charts/Choropleth";
import styles from "./explore.module.css";

type MapLayerId = "source_region" | "birth_region" | "residence_region";

const MAP_LAYERS: Array<{ id: MapLayerId; layer: MapLayer }> = [
  { id: "source_region", layer: "regions" },
  { id: "birth_region", layer: "regions" },
  { id: "residence_region", layer: "regions" },
];

export function MapView({ facets, labels, onChange }: { facets: Facets; labels: LabelMap; onChange: (change: FilterChange) => void }) {
  const [layerId, setLayerId] = useState<MapLayerId>("source_region");
  const layer = MAP_LAYERS.find((l) => l.id === layerId) ?? MAP_LAYERS[0];
  const dimension = dimensionById(layerId)!;
  const rows = useMemo(() => Object.entries(facets[dimension.attribute] ?? {}).map(([key, count]) => ({ key, count })), [facets, dimension.attribute]);
  const byCode = useMemo(
    () => labels.get(dimension.labelField) ?? new Map<string, { labelRu: string; sortOrder: number }>(),
    [labels, dimension.labelField],
  );
  const names = useMemo(() => new Map([...byCode].map(([code, l]) => [code, l.labelRu])), [byCode]);
  // The same unknown+unrecognized fold the home page's geography chapter uses (charts.ts), applied to
  // whatever layer is selected here — not Choropleth's own `unmatched` count: that also folds in codes
  // that are real and recognized but simply have no polygon of their own, which would overcount
  // "region unknown" for a layer where such codes occur.
  const unknownRegions = useMemo(() => unknownCount(rows), [rows]);

  const select = (polygon: string) => {
    // Every dictionary code the polygon paints joins the filter, so Moscow oblast follows the Moscow polygon.
    for (const code of codesForPolygon(byCode.keys(), polygon)) onChange({ kind: "code", dimension: dimension.id, code, on: true });
  };

  return (
    <>
      <section className={styles.mapCard}>
        <div className={styles.mapControls}>
          <SegmentedControl
            value={layerId}
            onChange={(value) => setLayerId(value as MapLayerId)}
            data={MAP_LAYERS.map((l) => ({ value: l.id, label: UI.explore.mapLayer[l.id] }))}
            aria-label={UI.explore.mapLayerLabel}
            data-testid="map-layer"
          />
          <span className={styles.mapHint}>{UI.explore.mapHint}</span>
        </div>
        <Choropleth
          layer={layer.layer}
          rows={rows}
          title={dimension.titleRu}
          names={names}
          showNote={false}
          // The switcher right above already names the selected layer, so the chart's own drawn
          // title would repeat it — `title` still names the chart for EChart's `ariaLabel`.
          showTitle={false}
          onSelect={select}
        />
      </section>
      {/* Under the card, not inside it — the same small muted note style ChartsView's own Card uses
          (explore.module.css's `.note`). The wording matches the home page's geography chapter
          (Story.tsx / UI.home.story.geography) so the two pages read the same; Choropleth's own
          figcaption is off above (showNote={false}) so it never doubles up with this one. */}
      <div className={styles.note}>
        <p>{UI.home.story.geography.note}</p>
        <p>
          {UI.home.story.geography.unknownLabel}: {formatInt(unknownRegions)}.{" "}
          <Link href="/about">{UI.chart.more}</Link>
        </p>
      </div>
    </>
  );
}
