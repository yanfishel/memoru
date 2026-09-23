-- Staging area for one sync batch. Temporary: dropped with the session.
CREATE TEMP TABLE IF NOT EXISTS sync_batch (
  page_id    integer     NOT NULL,
  title      text        NOT NULL,
  rev_id     bigint      NOT NULL,
  rev_ts     timestamptz NOT NULL,
  params     jsonb       NOT NULL,
  categories text[]      NOT NULL
) ON COMMIT DELETE ROWS;
