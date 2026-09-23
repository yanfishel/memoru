DROP SCHEMA IF EXISTS __SCHEMA__ CASCADE;
CREATE SCHEMA __SCHEMA__;

-- Age buckets are computed here and only here (aggregates and the search index read
-- the columns). The bucket labels are part of the spec's code set.
CREATE TABLE __SCHEMA__.person AS
SELECT p.*,
       CASE
         WHEN p.age_at_arrest IS NULL THEN 'unknown'
         WHEN p.age_at_arrest < 18 THEN '<18'
         WHEN p.age_at_arrest < 25 THEN '18-24'
         WHEN p.age_at_arrest < 35 THEN '25-34'
         WHEN p.age_at_arrest < 45 THEN '35-44'
         WHEN p.age_at_arrest < 55 THEN '45-54'
         WHEN p.age_at_arrest < 65 THEN '55-64'
         ELSE '65+'
       END AS age_at_arrest_bucket,
       CASE
         WHEN p.age_at_death IS NULL THEN 'unknown'
         WHEN p.age_at_death < 18 THEN '<18'
         WHEN p.age_at_death < 25 THEN '18-24'
         WHEN p.age_at_death < 35 THEN '25-34'
         WHEN p.age_at_death < 45 THEN '35-44'
         WHEN p.age_at_death < 55 THEN '45-54'
         WHEN p.age_at_death < 65 THEN '55-64'
         ELSE '65+'
       END AS age_at_death_bucket,
       EXISTS (SELECT 1 FROM staging.person_case c WHERE c.person_id = p.id AND c.rehab_year IS NOT NULL) AS rehabilitated
  FROM staging.person p;

-- CREATE TABLE ... AS SELECT drops NOT NULL from every source column; restore it
-- here for every column staging-normalized.sql declares NOT NULL, plus the three
-- computed columns above (id's NOT NULL comes from ADD PRIMARY KEY).
ALTER TABLE __SCHEMA__.person
  ADD PRIMARY KEY (id),
  ALTER COLUMN age_at_arrest_bucket SET NOT NULL,
  ALTER COLUMN age_at_death_bucket SET NOT NULL,
  ALTER COLUMN rehabilitated SET NOT NULL,
  ALTER COLUMN surname SET NOT NULL,
  ALTER COLUMN sex SET NOT NULL,
  ALTER COLUMN birth_country_code SET NOT NULL,
  ALTER COLUMN birth_region_code SET NOT NULL,
  ALTER COLUMN source_region_code SET NOT NULL,
  ALTER COLUMN residence_region_code SET NOT NULL,
  ALTER COLUMN nationality_code SET NOT NULL,
  ALTER COLUMN education_code SET NOT NULL,
  ALTER COLUMN party_code SET NOT NULL,
  ALTER COLUMN death_kind SET NOT NULL,
  ALTER COLUMN case_count SET NOT NULL,
  ALTER COLUMN first_sentence_type SET NOT NULL,
  ALTER COLUMN openlist_title SET NOT NULL;

CREATE TABLE __SCHEMA__.person_case AS SELECT * FROM staging.person_case;
-- Same as above: restore sentence_type's NOT NULL (person_id/n come from the PK).
ALTER TABLE __SCHEMA__.person_case
  ADD PRIMARY KEY (person_id, n),
  ALTER COLUMN sentence_type SET NOT NULL;

CREATE INDEX ON __SCHEMA__.person (surname, given_name, patronymic);
CREATE INDEX ON __SCHEMA__.person (source_region_code);
CREATE INDEX ON __SCHEMA__.person (birth_year);

CREATE TABLE __SCHEMA__.code_label (
  field      text     NOT NULL,
  code       text     NOT NULL,
  label_ru   text     NOT NULL,
  sort_order smallint NOT NULL,
  PRIMARY KEY (field, code)
);

CREATE TABLE __SCHEMA__.agg_dimension (
  dimension text    NOT NULL,
  key       text    NOT NULL,
  count     integer NOT NULL,
  PRIMARY KEY (dimension, key)
);

INSERT INTO __SCHEMA__.agg_dimension (dimension, key, count)
SELECT 'sex', sex, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'nationality', nationality_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'education', education_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'party', party_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'sentence_type', first_sentence_type, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'death_kind', death_kind, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'birth_country', birth_country_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'birth_region', birth_region_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'residence_region', residence_region_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'source_region', source_region_code, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'birth_year', coalesce(birth_year::text, 'unknown'), count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'arrest_year', coalesce(first_arrest_year::text, 'unknown'), count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'death_year', coalesce(death_year::text, 'unknown'), count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'age_at_arrest_bucket', age_at_arrest_bucket, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'age_at_death_bucket', age_at_death_bucket, count(*) FROM __SCHEMA__.person GROUP BY 2
UNION ALL SELECT 'rehabilitated', rehabilitated::text, count(*) FROM __SCHEMA__.person GROUP BY 2;

CREATE TABLE __SCHEMA__.agg_summary (
  key   text   PRIMARY KEY,
  value bigint NOT NULL
);

INSERT INTO __SCHEMA__.agg_summary (key, value)
SELECT 'persons', count(*) FROM __SCHEMA__.person
UNION ALL SELECT 'cases', count(*) FROM __SCHEMA__.person_case
UNION ALL SELECT 'executed', count(*) FROM __SCHEMA__.person WHERE death_kind = 'executed'
UNION ALL SELECT 'executed_confirmed', count(*) FROM __SCHEMA__.person WHERE first_sentence_type = 'vmn' AND death_kind = 'executed'
UNION ALL SELECT 'died', count(*) FROM __SCHEMA__.person WHERE death_kind = 'died'
UNION ALL SELECT 'rehabilitated', count(*) FROM __SCHEMA__.person WHERE rehabilitated
UNION ALL SELECT 'with_arrest_year', count(*) FROM __SCHEMA__.person WHERE first_arrest_year IS NOT NULL
UNION ALL SELECT 'multi_case', count(*) FROM __SCHEMA__.person WHERE case_count >= 2;

CREATE TABLE __SCHEMA__.build_info (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);

ANALYZE __SCHEMA__.person;
ANALYZE __SCHEMA__.person_case;
