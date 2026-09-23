# CLAUDE.md

## Project

Next.js 16 site plus a TypeScript ETL for the "Open List" (ru.openlist.wiki) victims database, CC BY-SA. Live at https://memoru.net (one droplet, `docker-compose.prod.yml`).

`docs/superpowers/` (handoff, specs, plans, measured notes) is local-only: git-ignored here, archived in the private `memoru_private` repository, and never committed to this public one, because it names the server and local paths. When it exists, start from `docs/superpowers/notes/handoff.md`: it carries the current state and what the next plan owns. Binding authority: `docs/superpowers/specs/2026-09-16-repression-victims-site-design.md` (data, serving, deployment) and `2026-09-17-site-redesign-design.md` (everything the visitor sees). Read the current plan in `docs/superpowers/plans/` before changing ETL or schema.

## Commands

- `pnpm dev` / `pnpm build`: the site, against the active serving build
- `pnpm test`: unit tests (Vitest, `tests/unit`). Export `SEVEN_ZIP_PATH` as a real shell variable or the 7z tests skip — `vitest.config.ts` does not read `.env`.
- `pnpm test:integration`: needs `docker compose up -d` and `TEST_DATABASE_URL`
- `pnpm test:e2e`: Playwright against `next start`; run `pnpm build` first
- `pnpm typecheck` / `pnpm lint`
- `pnpm etl <command>`: ETL CLI (`scripts/etl/cli.ts`); loads `.env` automatically, every command has `--help`. On the server it runs as `docker compose run --rm etl <command>`.
- `pnpm geo:build`: rebuilds `public/geo/*.json` from Natural Earth (`scripts/geo/`)

## Architecture

- ETL (`scripts/etl/`): `dump/` + `parse/` + `normalize/` fill `staging`; `api/` + `sync.ts` run the monthly refresh; `serving/` builds a versioned `serving_<build>` schema and `search/` the matching `people_<build>` Meilisearch index; `artifacts/` does build → ship → publish → rollback.
- The site never names a schema. `public.serving_slot` points at the active pair; `src/db/serving.ts` resolves it and binds Drizzle (5 s cache). `publish` swaps the slot and keeps the previous build for rollback.
- Site: `src/app/` (routes), `src/components/`, `src/lib/` (pure, browser-safe view models, filters, formatting), `src/theme/` (Mantine 9, both colour schemes).
- The database is built on the maintainer's home machine and shipped to the server as a finished database: the server runs none of the data pipeline and never needs the dump. It does build the search index from the shipped documents, which is deliberate — a ready-made Meilisearch dump or snapshot loads only at instance start and takes search down (spec §4.1). `README.md` has the ship/publish commands. Code reaches the server only by publishing a GitHub release `vX.Y.Z` (`.github/workflows/release.yml` → `docker/deploy.sh`); `ci.yml` checks every push.

## Rules

- `master` is protected by a ruleset: no direct pushes for anyone, including admins. Work on a branch, open a pull request, and squash-merge it once the `check` job (`ci.yml`) is green. Release tags `v*` cannot be moved or deleted. Deploy secrets live in the `production` environment, which only `master` and `v*` tags may use.
- All code, comments, identifiers and commit messages are in English. Russian appears only in data: every UI string lives in `src/lib/ui-text.ts`, plus template parameter names, dictionary raw values, fixtures. The one document exception is `README.ru.md`, the maintainer-requested translation of `README.md`: change both together.
- Bulk database writes go through `COPY` (`scripts/etl/db/copy.ts`), never row-by-row inserts.
- The `staging` schema is recreated from `scripts/etl/db/staging.sql` on every import. Do not add migrations for it.
- The live ru.openlist.wiki API is called from exactly one place: `scripts/etl/api/client.ts`, used by `pnpm etl sync`. It sends a descriptive `API_USER_AGENT` with a contact, `maxlag=5`, and serializes requests at least `API_MIN_INTERVAL_MS` apart. Never call it from anywhere else, never in tests, never in parallel.
- The dump repeats each page across scattered `<page>` blocks (18.4M blocks for 3.35M pages, newest revision first). Anything reading it must dedupe by page id keeping the highest `rev_id`.
- Missing values are coded `unknown` and unmapped values `unrecognized`. Never drop them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
