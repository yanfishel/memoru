#!/bin/sh
# The `etl` service is this image with a different entrypoint (spec §4). It runs the CLI through
# tsx, the same way `pnpm etl` does on the home machine, so there is one code path, not two.
set -eu
exec node_modules/.bin/tsx scripts/etl/cli.ts "$@"
