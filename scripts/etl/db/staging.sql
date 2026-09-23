DROP SCHEMA IF EXISTS staging CASCADE;
CREATE SCHEMA staging;

-- Primary key is added after the bulk load (see import.ts).
CREATE TABLE staging.person_raw (
  page_id    integer     NOT NULL,
  title      text        NOT NULL,
  rev_id     bigint      NOT NULL,
  rev_ts     timestamptz NOT NULL,
  params     jsonb       NOT NULL,
  categories text[]      NOT NULL
);

CREATE TABLE staging.etl_errors (
  page_id    integer,
  stage      text        NOT NULL,
  reason     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staging.import_meta (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);
