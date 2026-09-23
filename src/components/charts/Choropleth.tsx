"use client";

import * as echarts from "echarts";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatInt } from "@/lib/format";
import { choroplethOption, joinCounts, MAP_ASPECT, MAP_TITLE_GAP, type MapLayer } from "@/lib/map";
import { UI } from "@/lib/ui-text";
import styles from "./Choropleth.module.css";
import { EChart } from "./EChart";
import { usePalette } from "./usePalette";

interface GeoLayer {
  features: Array<{ properties: { code: string; name: string } }>;
}

/** One fetch and one `registerMap` per layer, shared by every chart on the page. */
const loaded = new Map<MapLayer, Promise<Set<string>>>();

function loadLayer(layer: MapLayer): Promise<Set<string>> {
  let pending = loaded.get(layer);
  if (!pending) {
    pending = fetch(`/geo/${layer}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`/geo/${layer}.json: HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((geo) => {
        // The file is a GeoJSON FeatureCollection; echarts types it through its own GeoJSON shape.
        echarts.registerMap(layer, geo as Parameters<typeof echarts.registerMap>[1]);
        return new Set((geo as GeoLayer).features.map((f) => f.properties.code));
      })
      .catch((error: unknown) => {
        // A rejected promise must not stay in the cache, or every later mount keeps failing on it.
        loaded.delete(layer);
        throw error;
      });
    loaded.set(layer, pending);
  }
  return pending;
}

export function Choropleth({
  layer,
  rows,
  title,
  names,
  showCollapseNote,
  showNote = true,
  showTitle = true,
  onSelect,
}: {
  layer: MapLayer;
  rows: Array<{ key: string; count: number }>;
  title: string;
  names?: Map<string, string>;
  showCollapseNote?: boolean;
  /** False suppresses the whole figcaption below the map — for a caller that prints its own version
      of the same boundaries/collapse/unmatched-count note (the home page's geography chapter,
      Story.tsx), so the note never appears twice on one page. Every other call site leaves this at
      the default and keeps the note here. */
  showNote?: boolean;
  /** False hides the map's own drawn title while `title` still names the chart for `EChart`'s
      `ariaLabel` below — the explore page's map, where the layer switcher right above it already
      names what is drawn, so a second, on-canvas title would repeat it. */
  showTitle?: boolean;
  onSelect?: (polygon: string) => void;
}) {
  const { accent, rule } = usePalette();
  // The container's own shape (MAP_ASPECT), plus the drawn title's fixed band when shown — see
  // Choropleth.module.css's `.ratio` for why this is a CSS custom property, not an `aspect-ratio`.
  const ratioStyle = { "--map-aspect": MAP_ASPECT, "--map-gap": `${showTitle ? MAP_TITLE_GAP : 0}px` } as CSSProperties;
  // Both pieces of state remember which layer they describe: when `layer` changes, the previous layer's
  // codes must not be joined against it, and echarts must not be handed a map name it has yet to register.
  const [layerData, setLayerData] = useState<{ layer: MapLayer; codes: Set<string> } | null>(null);
  const [failed, setFailed] = useState<MapLayer | null>(null);

  useEffect(() => {
    let alive = true;
    void loadLayer(layer).then(
      (codes) => {
        if (!alive) return;
        setLayerData({ layer, codes });
        // A later attempt at a layer that failed before must clear the failure, or the alert stays forever.
        setFailed((previous) => (previous === layer ? null : previous));
      },
      () => {
        if (alive) setFailed(layer);
      },
    );
    return () => {
      alive = false;
    };
  }, [layer]);

  const known = layerData?.layer === layer ? layerData.codes : null;

  const joined = useMemo(() => (known ? joinCounts(rows, known) : null), [known, rows]);
  const option = useMemo(() => {
    if (!joined) return null;
    const max = joined.data.reduce((m, d) => Math.max(m, d.value), 0);
    return choroplethOption({ title: showTitle ? title : undefined, data: joined.data, max, accent, from: rule, mapName: layer, names });
  }, [joined, title, showTitle, accent, rule, layer, names]);

  if (failed === layer) return <p role="alert">{UI.map.unavailable}</p>;
  if (!joined || !option) return <div className={styles.ratio} style={ratioStyle} aria-busy="true" />;
  const unmatched = joined.unmatched.reduce((sum, r) => sum + r.count, 0);
  return (
    <figure>
      <div className={styles.ratio} style={ratioStyle}>
        <EChart option={option} fill ariaLabel={title} onClick={onSelect} />
      </div>
      {/* The two capital oblasts are dissolved into their cities in the geometry, so one polygon carries the
          collapsed counts; `UI.footer.collapse` is what tells the reader that. */}
      {showNote && (
        <figcaption>
          {UI.footer.boundaries} {showCollapseNote ? `${UI.footer.collapse} ` : null}
          {UI.map.noRegion(formatInt(unmatched))}. <Link href="/about">{UI.chart.more}</Link>
        </figcaption>
      )}
    </figure>
  );
}
