# syntax=docker/dockerfile:1

# The ETL runs from TypeScript through tsx, and the site runs from Next's standalone output, so the
# image carries both: the traced server bundle plus the ETL sources and the dependencies they import.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# SITE_URL is deliberately absent: site-url.ts reads it at call time so the build never bakes an
# origin into the bundle (see its comment). The container gets it from the environment.
# `next build` copies the project's .env into .next/standalone/.env so @next/env can read it in a
# plain `next start` deployment. This image never wants that: .dockerignore keeps .env out of the
# build context today, but that is one edited line away from shipping DATABASE_URL and
# MEILI_MASTER_KEY into the image. Delete whatever standalone wrote so there is nothing to copy
# below, regardless of what the build context contained.
RUN pnpm build && find .next/standalone -maxdepth 1 -name '.env*' -delete

FROM base AS runtime
WORKDIR /app
# Links the GHCR package to its repository, so the release workflow's token can push to it.
LABEL org.opencontainers.image.source=https://github.com/yanfishel/memoru
ENV NODE_ENV=production
# pg_restore must be at least the version that wrote the dump; the home machine dumps from
# postgres:18.6, so the client has to be 18 and Debian bookworm ships 15.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-18 \
  && rm -rf /var/lib/apt/lists/*

# The site: the standalone server plus the assets it does not trace (static chunks, public files,
# and assets/ which the OG image routes read at request time — see next.config's tracing includes).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
# Defends against a secret (DATABASE_URL, MEILI_MASTER_KEY) reaching this layer: @next/env loads
# .env at startup, and `next build` writes one into .next/standalone by default. The build stage
# already deletes it, and .dockerignore already keeps the source .env out of the build context, so
# this should never fire — do not remove it as noise; it is the backstop for both of those.
RUN if [ -n "$(find /app -maxdepth 1 -name '.env*' -print -quit)" ]; then \
      echo "FATAL: .env file present in runtime image" >&2; exit 1; \
    fi

# The ETL: its sources, the dictionaries and labels it reads, and the dependencies tsx needs.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/data ./data
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker/entrypoint-etl.sh ./docker/entrypoint-etl.sh
RUN chmod +x ./docker/entrypoint-etl.sh

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
