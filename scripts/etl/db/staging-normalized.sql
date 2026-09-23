DROP TABLE IF EXISTS staging.person_case;
DROP TABLE IF EXISTS staging.person;

-- Primary keys are added after the bulk load (see normalize/run.ts).
CREATE TABLE staging.person (
  id                   integer  NOT NULL,
  surname              text     NOT NULL,
  given_name           text,
  patronymic           text,
  title_year           smallint,
  sex                  text     NOT NULL,
  birth_year           smallint,
  birth_month          smallint,
  birth_day            smallint,
  birth_date_precision char(1),
  birth_place_raw      text,
  birth_country_code   text     NOT NULL,
  birth_region_code    text     NOT NULL,
  source_region_code   text     NOT NULL,
  residence_raw        text,
  residence_region_code text    NOT NULL,
  nationality_raw      text,
  nationality_code     text     NOT NULL,
  education_raw        text,
  education_code       text     NOT NULL,
  party_raw            text,
  party_code           text     NOT NULL,
  death_kind           text     NOT NULL,
  death_year           smallint,
  death_month          smallint,
  death_day            smallint,
  death_date_precision char(1),
  age_at_death         smallint,
  case_count           smallint NOT NULL,
  first_arrest_year    smallint,
  age_at_arrest        smallint,
  first_sentence_type  text     NOT NULL,
  source_raw           text,
  photo_file           text,
  photo_caption_raw    text,
  openlist_title       text     NOT NULL
);

CREATE TABLE staging.person_case (
  person_id                 integer  NOT NULL,
  n                         smallint NOT NULL,
  arrest_year               smallint,
  arrest_month              smallint,
  arrest_day                smallint,
  arrest_date_precision     char(1),
  conviction_year           smallint,
  conviction_month          smallint,
  conviction_day            smallint,
  conviction_date_precision char(1),
  court_raw                 text,
  article_raw               text,
  sentence_raw              text,
  sentence_type             text     NOT NULL,
  sentence_years            smallint,
  sentence_months           smallint,
  rehab_year                smallint,
  rehab_month               smallint,
  rehab_day                 smallint,
  rehab_date_precision      char(1),
  rehab_body_raw            text
);

DELETE FROM staging.etl_errors WHERE stage = 'normalize';
