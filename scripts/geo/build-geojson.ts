/**
 * Builds the two GeoJSON layers the choropleth needs from Natural Earth.
 *
 * Downloads are cached in `.tmp/geo` (git-ignored); the outputs in `public/geo` are committed,
 * so the site never depends on the network and the coverage test can read them.
 *
 * Field names below were verified against the downloaded files: the admin-1 layer carries
 * `iso_3166_2`, `adm0_a3` and `name`; the countries layer carries `ISO_A2`, `ISO_A2_EH` and `NAME`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const ADMIN1 = "ne_50m_admin_1_states_provinces.geojson";
/** The `_ukr` variant draws Crimea inside Ukraine. It only ships at 1:10m, so the 1:50m name is just a probe. */
const COUNTRIES = ["ne_50m_admin_0_countries_ukr.geojson", "ne_10m_admin_0_countries_ukr.geojson"];
/** Former Soviet republics, kept as single features next to Russia's admin-1 units. */
const REPUBLICS = ["UA", "BY", "MD", "KZ", "KG", "TJ", "TM", "UZ", "GE", "AM", "AZ", "LT", "LV", "EE"];
/**
 * Simplification is given as a ground interval rather than a percentage of the vertices: the two sources are
 * drawn at different scales (1:50m for Russia's units, 1:10m for the countries), and a percentage would leave
 * them at wildly different detail. 2 km keeps the small oblasts readable; 5 km is plenty for a world map.
 */
const REGION_INTERVAL = "interval=2000";
const COUNTRY_INTERVAL = "interval=5000";
const TMP = ".tmp/geo";
const OUT = "public/geo";
/** `ISO_A2` is `-99` for disputed or dependent rows; `ISO_A2_EH` holds the code we want there. */
const COUNTRY_CODE = '(ISO_A2 == "-99" ? ISO_A2_EH : ISO_A2)';
/**
 * Natural Earth swaps Moscow's two ISO codes: it labels the oblast (`Moskovskaya`, wikidata Q1697)
 * `RU-MOW` and the federal city (`Moskva`, Q649) `RU-MOS`, while ISO 3166-2:RU is the other way round.
 * The dictionaries follow ISO, so the codes are put back before anything joins on them.
 *
 * The two capital oblasts are then folded into their cities, because the source marks their records that way
 * and `mapKey` sends `RU-MOS`/`RU-LEN` counts to `RU-MOW`/`RU-SPE`: the polygons are dissolved to match, so the
 * collapsed counts paint the whole area (city plus oblast) instead of the city dot alone. No `RU-MOS` or
 * `RU-LEN` feature survives.
 */
const ADMIN1_CODE = 'name == "Moskva" || name == "Moskovskaya" ? "RU-MOW" : (iso_3166_2 == "RU-LEN" ? "RU-SPE" : iso_3166_2)';
/** The dissolved pairs take the city's name, which is what the tooltip should show. */
const ADMIN1_NAME = 'code == "RU-MOW" ? "Moskva" : (code == "RU-SPE" ? "City of St. Petersburg" : name)';

async function download(name: string): Promise<string | null> {
  const file = join(TMP, name);
  if (existsSync(file)) return file;
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) {
    console.warn(`${name}: HTTP ${response.status}`);
    return null;
  }
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function mapshaper(args: string[]): void {
  execFileSync(process.execPath, [join("node_modules", "mapshaper", "bin", "mapshaper"), ...args], { stdio: "inherit" });
}

type Ring = Array<[number, number]>;
type Coordinates = Ring | Ring[] | Ring[][];

/**
 * Chukotka reaches past 180°E, so Natural Earth files its eastern islands at negative longitudes.
 * Left alone they stretch the layer's bounding box across the whole globe and ECharts draws Russia
 * as a thin strip. Shifting those rings to 180…190°E keeps the region-level map framed on Russia.
 * The world map keeps the conventional -180…180 frame, so this runs on the regions layer only.
 */
function unwrapAntimeridian(file: string): void {
  const geo = JSON.parse(readFileSync(file, "utf8")) as { features: Array<{ geometry: { coordinates: Coordinates } }> };
  const shift = (coords: Coordinates): void => {
    if (typeof coords[0]?.[0] === "number") {
      const ring = coords as Ring;
      // A ring never straddles the antimeridian: mapshaper cuts there, so the whole ring moves or none of it does.
      if (ring.every(([lon]) => lon < 0)) {
        for (const point of ring) point[0] = Math.round((point[0] + 360) * 1000) / 1000;
      }
      return;
    }
    for (const part of coords as Ring[] | Ring[][]) shift(part);
  };
  for (const feature of geo.features) shift(feature.geometry.coordinates);
  writeFileSync(file, JSON.stringify(geo));
}

function report(file: string): void {
  console.log(`${file}: ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}

async function main(): Promise<void> {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const admin1 = await download(ADMIN1);
  if (!admin1) throw new Error(`could not download ${ADMIN1}`);
  let countries: string | null = null;
  for (const name of COUNTRIES) {
    countries = await download(name);
    if (countries) break;
  }
  if (!countries) throw new Error("could not download a *_countries_ukr.geojson file");

  // Russia's admin-1 units plus the republics as single features.
  // Natural Earth files Crimea and Sevastopol under `adm0_a3 == "RUS"` but codes them `UA-43`/`UA-40`,
  // so keeping only `RU-` codes drops them here; the `_ukr` countries file draws them inside Ukraine.
  mapshaper([
    "-i", admin1, "name=ru",
    "-filter", 'adm0_a3 == "RUS" && iso_3166_2.indexOf("RU-") == 0',
    "-each", `code = ${ADMIN1_CODE}`,
    "-each", `name = ${ADMIN1_NAME}`,
    "-filter-fields", "code,name",
    "-dissolve", "code", "copy-fields=name",
    "-simplify", REGION_INTERVAL, "keep-shapes",
    "-clean",
    "-i", countries, "name=republics",
    "-filter", `[${REPUBLICS.map((c) => `"${c}"`).join(",")}].indexOf(${COUNTRY_CODE}) > -1`,
    "-each", `code = ${COUNTRY_CODE}, name = NAME`,
    "-filter-fields", "code,name",
    "-simplify", REGION_INTERVAL, "keep-shapes",
    "-clean",
    // Each source is simplified inside its own topology: the two files are drawn at different scales,
    // so simplifying the merged layer would cross their shared borders thousands of times.
    "-merge-layers", "target=ru,republics", "force",
    "-o", join(OUT, "regions.json"), "format=geojson", "precision=0.001",
  ]);

  // Rows without any ISO code (Akrotiri, Bir Tawil, Spratly Is. and the like) cannot be joined and are dropped;
  // the remaining dependencies that share a parent's code (Clipperton with FR, Coral Sea Is. with AU) are
  // dissolved into it, so every feature ECharts registers has a unique name.
  mapshaper([
    "-i", countries,
    "-filter", `${COUNTRY_CODE} != "-99"`,
    "-each", `code = ${COUNTRY_CODE}, name = NAME`,
    "-filter-fields", "code,name",
    "-simplify", COUNTRY_INTERVAL, "keep-shapes",
    "-clean",
    "-dissolve", "code", "copy-fields=name",
    "-o", join(OUT, "countries.json"), "format=geojson", "precision=0.001",
  ]);

  unwrapAntimeridian(join(OUT, "regions.json"));
  report(join(OUT, "regions.json"));
  report(join(OUT, "countries.json"));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
