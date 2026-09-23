export type DimensionKind = "code" | "year" | "bucket";

export type DimensionId =
  | "sex" | "nationality" | "birth_year" | "arrest_year" | "age_at_arrest" | "sentence_type"
  | "birth_region" | "residence_region" | "source_region" | "death_year" | "education" | "party"
  | "death_kind" | "rehabilitated";

export interface Dimension {
  id: DimensionId;
  kind: DimensionKind;
  /** Meilisearch document field (spec §6.3) and agg_dimension key for the same data. */
  attribute: string;
  /** agg_dimension.dimension name. */
  aggregate: string;
  /** code_label.field the values are labelled with. */
  labelField: string;
  titleRu: string;
  /** Shorter wording for a filter chip, where the full title is long and the context is already clear
   * (2026-09-18 review). Falls back to `titleRu`. */
  chipTitleRu?: string;
  chart: "bar" | "pie" | "histogram" | "none";
  /** Coverage below 90 %: charts show the unknown share and a caveat. */
  caveat: boolean;
  yearRange?: [number, number];
  /** Meilisearch stores this attribute as a boolean, not a string — filter clauses use unquoted literals. */
  valueType?: "boolean";
}

export const DIMENSIONS: readonly Dimension[] = [
  { id: "sex", kind: "code", attribute: "sex", aggregate: "sex", labelField: "sex", titleRu: "Пол", chart: "pie", caveat: false },
  { id: "nationality", kind: "code", attribute: "nationality_code", aggregate: "nationality", labelField: "nationality", titleRu: "Национальность", chart: "bar", caveat: true },
  { id: "birth_year", kind: "year", attribute: "birth_year", aggregate: "birth_year", labelField: "", titleRu: "Год рождения", chart: "histogram", caveat: false, yearRange: [1840, 1975] },
  { id: "arrest_year", kind: "year", attribute: "arrest_year", aggregate: "arrest_year", labelField: "", titleRu: "Год ареста", chart: "histogram", caveat: true, yearRange: [1917, 1991] },
  { id: "age_at_arrest", kind: "bucket", attribute: "age_at_arrest_bucket", aggregate: "age_at_arrest_bucket", labelField: "age_bucket", titleRu: "Возраст на момент ареста", chipTitleRu: "Возраст", chart: "bar", caveat: true },
  { id: "sentence_type", kind: "code", attribute: "sentence_type", aggregate: "sentence_type", labelField: "sentence_type", titleRu: "Приговор", chart: "bar", caveat: true },
  // birth_country (birth_country_code) is deliberately absent here: retired from the filter UI, the
  // map layer switcher and the URL parser (2026-09-18), while the data itself — the serving column,
  // the search attribute, the aggregate and the "birth_country" label map — stays; the person page
  // still reads that label map directly (person-view.ts), not through this registry.
  // titleRu matches the map layer switcher's own wording for the same two layers (UI.explore.mapLayer,
  // ui-text.ts) — renamed together 2026-09-18; "Место проживания" on the person page (UI.person.fields.residence)
  // is a different string, about one person's address, and stays as it was.
  { id: "birth_region", kind: "code", attribute: "birth_region_code", aggregate: "birth_region", labelField: "birth_region", titleRu: "Место рождения", chart: "none", caveat: true },
  { id: "residence_region", kind: "code", attribute: "residence_region_code", aggregate: "residence_region", labelField: "residence_region", titleRu: "Место жительства", chart: "none", caveat: true },
  { id: "source_region", kind: "code", attribute: "source_region_code", aggregate: "source_region", labelField: "source_region", titleRu: "Источник", chart: "none", caveat: false },
  { id: "death_year", kind: "year", attribute: "death_year", aggregate: "death_year", labelField: "", titleRu: "Год смерти", chart: "histogram", caveat: true, yearRange: [1917, 1991] },
  { id: "education", kind: "code", attribute: "education_code", aggregate: "education", labelField: "education", titleRu: "Образование", chart: "bar", caveat: true },
  { id: "party", kind: "code", attribute: "party_code", aggregate: "party", labelField: "party", titleRu: "Партийность", chart: "bar", caveat: true },
  { id: "death_kind", kind: "code", attribute: "death_kind", aggregate: "death_kind", labelField: "death_kind", titleRu: "Судьба", chart: "pie", caveat: true },
  { id: "rehabilitated", kind: "code", attribute: "rehabilitated", aggregate: "rehabilitated", labelField: "rehabilitated", titleRu: "Реабилитация", chart: "pie", caveat: false, valueType: "boolean" },
];

const BY_ID = new Map(DIMENSIONS.map((d) => [d.id, d]));

export function dimensionById(id: string): Dimension | undefined {
  return BY_ID.get(id as DimensionId);
}
