import "server-only";

/**
 * Reading the checked-in geometry from disk: server components, scripts and tests only.
 * Never import this from a client component — it would drag `node:fs` into the browser bundle.
 */
import { readFileSync } from "node:fs";
import type { MapLayer } from "./map";

const codeCache = new Map<MapLayer, Set<string>>();

/** Codes present in the checked-in GeoJSON. The browser gets the same set from the layer it fetches. */
export function geoCodes(layer: MapLayer): Set<string> {
  let codes = codeCache.get(layer);
  if (!codes) {
    const geo = JSON.parse(readFileSync(`public/geo/${layer}.json`, "utf8")) as { features: Array<{ properties: { code: string } }> };
    codes = new Set(geo.features.map((f) => f.properties.code));
    codeCache.set(layer, codes);
  }
  return codes;
}
