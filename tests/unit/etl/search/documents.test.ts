import { describe, expect, it } from "vitest";
import { INDEX_SETTINGS, toDocument, type ServingPersonRow } from "../../../../scripts/etl/search/documents";

const ROW: ServingPersonRow = {
  id: 101,
  surname: "Ёлкин",
  given_name: "Пётр",
  patronymic: null,
  title_year: 1892,
  sex: "m",
  birth_year: 1892,
  death_year: null,
  first_arrest_year: 1938,
  age_at_arrest_bucket: "45-54",
  age_at_death_bucket: "unknown",
  nationality_code: "russian",
  education_code: "literate",
  party_code: "non_party",
  first_sentence_type: "itl",
  birth_region_code: "RU-CHE",
  residence_region_code: "unknown",
  source_region_code: "RU-CHE",
  birth_country_code: "RU",
  death_kind: "unknown",
  rehabilitated: true,
  photo_file: null,
};

describe("toDocument", () => {
  it("maps a serving row to the search document", () => {
    expect(toDocument(ROW)).toEqual({
      id: 101,
      surname: "Ёлкин",
      given_name: "Пётр",
      patronymic: null,
      name: "Ёлкин Пётр",
      name_folded: "Елкин Петр",
      title_year: 1892,
      birth_year: 1892,
      death_year: null,
      arrest_year: 1938,
      age_at_arrest_bucket: "45-54",
      age_at_death_bucket: "unknown",
      sex: "m",
      nationality_code: "russian",
      education_code: "literate",
      party_code: "non_party",
      sentence_type: "itl",
      birth_region_code: "RU-CHE",
      residence_region_code: "unknown",
      source_region_code: "RU-CHE",
      birth_country_code: "RU",
      death_kind: "unknown",
      rehabilitated: true,
      has_photo: false,
    });
  });

  it("sets has_photo from photo_file alone, never storing the file name itself", () => {
    const withPhoto = toDocument({ ...ROW, photo_file: "Иванов.jpg" });
    expect(withPhoto.has_photo).toBe(true);
    expect(withPhoto).not.toHaveProperty("photo_file");
  });

  it("declares every filter field and only name fields as searchable", () => {
    expect(INDEX_SETTINGS.searchableAttributes).toEqual(["name", "name_folded"]);
    for (const field of ["sex", "nationality_code", "sentence_type", "arrest_year", "age_at_arrest_bucket", "residence_region_code", "rehabilitated"]) {
      expect(INDEX_SETTINGS.filterableAttributes).toContain(field);
    }
    expect(INDEX_SETTINGS.filterableAttributes).not.toContain("name");
    expect(INDEX_SETTINGS.sortableAttributes).toEqual(["surname", "birth_year", "arrest_year"]);
    // `sort` ahead of relevance: a sorted name search must order the whole result, not each relevance bucket.
    expect(INDEX_SETTINGS.rankingRules).toEqual(["sort", "words", "typo", "proximity", "attribute", "exactness"]);
  });
});
