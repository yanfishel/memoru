import type { Settings } from "meilisearch";

/** The columns `buildSearchIndex` selects from serving.person, snake_case as in SQL. */
export interface ServingPersonRow {
  id: number;
  surname: string;
  given_name: string | null;
  patronymic: string | null;
  title_year: number | null;
  sex: string;
  birth_year: number | null;
  death_year: number | null;
  first_arrest_year: number | null;
  age_at_arrest_bucket: string;
  age_at_death_bucket: string;
  nationality_code: string;
  education_code: string;
  party_code: string;
  first_sentence_type: string;
  birth_region_code: string;
  residence_region_code: string;
  source_region_code: string;
  birth_country_code: string;
  death_kind: string;
  rehabilitated: boolean;
  photo_file: string | null;
}

export const PERSON_COLUMNS = [
  "id", "surname", "given_name", "patronymic", "title_year", "sex", "birth_year", "death_year",
  "first_arrest_year", "age_at_arrest_bucket", "age_at_death_bucket", "nationality_code", "education_code",
  "party_code", "first_sentence_type", "birth_region_code", "residence_region_code", "source_region_code",
  "birth_country_code", "death_kind", "rehabilitated", "photo_file",
] as const;

/** Spec §6.3 document. */
export interface PersonDocument {
  id: number;
  surname: string;
  given_name: string | null;
  patronymic: string | null;
  name: string;
  name_folded: string;
  title_year: number | null;
  birth_year: number | null;
  death_year: number | null;
  arrest_year: number | null;
  age_at_arrest_bucket: string;
  age_at_death_bucket: string;
  sex: string;
  nationality_code: string;
  education_code: string;
  party_code: string;
  sentence_type: string;
  birth_region_code: string;
  residence_region_code: string;
  source_region_code: string;
  birth_country_code: string;
  death_kind: string;
  rehabilitated: boolean;
  /** Whether the person has a photo, not which file: the list only ever needs to show or hide the
   * icon, and the file name itself is neither searchable nor filterable. */
  has_photo: boolean;
}

export const FILTER_FIELDS = [
  "birth_year", "death_year", "arrest_year", "age_at_arrest_bucket", "age_at_death_bucket", "sex",
  "nationality_code", "education_code", "party_code", "sentence_type", "birth_region_code",
  "residence_region_code", "source_region_code", "birth_country_code", "death_kind", "rehabilitated",
] as const;

export const INDEX_SETTINGS: Settings = {
  searchableAttributes: ["name", "name_folded"],
  filterableAttributes: [...FILTER_FIELDS],
  sortableAttributes: ["surname", "birth_year", "arrest_year"],
  // `sort` ahead of the relevance rules: with no `sort` in the request the rule is inert, and with one the
  // result is ordered globally instead of within each relevance bucket — what a sorted name search means.
  rankingRules: ["sort", "words", "typo", "proximity", "attribute", "exactness"],
  faceting: { maxValuesPerFacet: 400 },
  pagination: { maxTotalHits: 100_000 },
  typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
};

function foldYo(text: string): string {
  return text.replace(/ё/g, "е").replace(/Ё/g, "Е");
}

export function toDocument(row: ServingPersonRow): PersonDocument {
  const name = [row.surname, row.given_name, row.patronymic].filter((part): part is string => !!part).join(" ");
  return {
    id: row.id,
    surname: row.surname,
    given_name: row.given_name,
    patronymic: row.patronymic,
    name,
    name_folded: foldYo(name),
    title_year: row.title_year,
    birth_year: row.birth_year,
    death_year: row.death_year,
    arrest_year: row.first_arrest_year,
    age_at_arrest_bucket: row.age_at_arrest_bucket,
    age_at_death_bucket: row.age_at_death_bucket,
    sex: row.sex,
    nationality_code: row.nationality_code,
    education_code: row.education_code,
    party_code: row.party_code,
    sentence_type: row.first_sentence_type,
    birth_region_code: row.birth_region_code,
    residence_region_code: row.residence_region_code,
    source_region_code: row.source_region_code,
    birth_country_code: row.birth_country_code,
    death_kind: row.death_kind,
    rehabilitated: row.rehabilitated,
    has_photo: row.photo_file !== null,
  };
}
