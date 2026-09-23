-- One row naming the serving schema and the search index the web app must read.
-- Lives in public so it survives every serving_* build, dump and swap.
CREATE TABLE IF NOT EXISTS public.serving_slot (
  id              smallint    PRIMARY KEY CHECK (id = 1),
  active_schema   text        NOT NULL,
  previous_schema text,
  search_index    text,
  previous_index  text,
  activated_at    timestamptz NOT NULL DEFAULT now()
);
