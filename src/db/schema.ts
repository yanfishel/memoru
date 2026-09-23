import { bigint, boolean, char, integer, jsonb, pgSchema, primaryKey, smallint, text } from "drizzle-orm/pg-core";

/** Drizzle tables bound to one serving_<build> schema. The ETL owns the DDL
 * (scripts/etl/db/serving.sql); this file mirrors it for typed reads only. */
export function servingTables(schemaName: string) {
  const s = pgSchema(schemaName);

  const person = s.table("person", {
    id: integer("id").primaryKey(),
    surname: text("surname").notNull(),
    givenName: text("given_name"),
    patronymic: text("patronymic"),
    titleYear: smallint("title_year"),
    sex: text("sex").notNull(),
    birthYear: smallint("birth_year"),
    birthMonth: smallint("birth_month"),
    birthDay: smallint("birth_day"),
    birthDatePrecision: char("birth_date_precision", { length: 1 }),
    birthPlaceRaw: text("birth_place_raw"),
    birthCountryCode: text("birth_country_code").notNull(),
    birthRegionCode: text("birth_region_code").notNull(),
    sourceRegionCode: text("source_region_code").notNull(),
    residenceRaw: text("residence_raw"),
    residenceRegionCode: text("residence_region_code").notNull(),
    nationalityRaw: text("nationality_raw"),
    nationalityCode: text("nationality_code").notNull(),
    educationRaw: text("education_raw"),
    educationCode: text("education_code").notNull(),
    partyRaw: text("party_raw"),
    partyCode: text("party_code").notNull(),
    deathKind: text("death_kind").notNull(),
    deathYear: smallint("death_year"),
    deathMonth: smallint("death_month"),
    deathDay: smallint("death_day"),
    deathDatePrecision: char("death_date_precision", { length: 1 }),
    ageAtDeath: smallint("age_at_death"),
    caseCount: smallint("case_count").notNull(),
    firstArrestYear: smallint("first_arrest_year"),
    ageAtArrest: smallint("age_at_arrest"),
    firstSentenceType: text("first_sentence_type").notNull(),
    sourceRaw: text("source_raw"),
    photoFile: text("photo_file"),
    photoCaptionRaw: text("photo_caption_raw"),
    openlistTitle: text("openlist_title").notNull(),
    ageAtArrestBucket: text("age_at_arrest_bucket").notNull(),
    ageAtDeathBucket: text("age_at_death_bucket").notNull(),
    rehabilitated: boolean("rehabilitated").notNull(),
  });

  const personCase = s.table(
    "person_case",
    {
      personId: integer("person_id").notNull(),
      n: smallint("n").notNull(),
      arrestYear: smallint("arrest_year"),
      arrestMonth: smallint("arrest_month"),
      arrestDay: smallint("arrest_day"),
      arrestDatePrecision: char("arrest_date_precision", { length: 1 }),
      convictionYear: smallint("conviction_year"),
      convictionMonth: smallint("conviction_month"),
      convictionDay: smallint("conviction_day"),
      convictionDatePrecision: char("conviction_date_precision", { length: 1 }),
      courtRaw: text("court_raw"),
      articleRaw: text("article_raw"),
      sentenceRaw: text("sentence_raw"),
      sentenceType: text("sentence_type").notNull(),
      sentenceYears: smallint("sentence_years"),
      sentenceMonths: smallint("sentence_months"),
      rehabYear: smallint("rehab_year"),
      rehabMonth: smallint("rehab_month"),
      rehabDay: smallint("rehab_day"),
      rehabDatePrecision: char("rehab_date_precision", { length: 1 }),
      rehabBodyRaw: text("rehab_body_raw"),
    },
    (t) => [primaryKey({ columns: [t.personId, t.n] })],
  );

  const codeLabel = s.table(
    "code_label",
    {
      field: text("field").notNull(),
      code: text("code").notNull(),
      labelRu: text("label_ru").notNull(),
      sortOrder: smallint("sort_order").notNull(),
    },
    (t) => [primaryKey({ columns: [t.field, t.code] })],
  );

  const aggDimension = s.table(
    "agg_dimension",
    {
      dimension: text("dimension").notNull(),
      key: text("key").notNull(),
      count: integer("count").notNull(),
    },
    (t) => [primaryKey({ columns: [t.dimension, t.key] })],
  );

  const aggSummary = s.table("agg_summary", {
    key: text("key").primaryKey(),
    value: bigint("value", { mode: "number" }).notNull(),
  });

  const buildInfo = s.table("build_info", {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
  });

  return { person, personCase, codeLabel, aggDimension, aggSummary, buildInfo };
}

export type ServingTables = ReturnType<typeof servingTables>;
export type PersonRecord = ServingTables["person"]["$inferSelect"];
export type CaseRecord = ServingTables["personCase"]["$inferSelect"];
