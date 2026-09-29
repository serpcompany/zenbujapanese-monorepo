#!/usr/bin/env bash
# The search database's schema as it is, for comparing with src/db/search-schema.sql.
#
#   scripts/search-d1/schema.sh              the schema the migrations build, on an empty local D1
#   scripts/search-d1/schema.sh <config>     the schema of the D1 named in <config>, remotely
#
# `pnpm db:check:search` fails when the migrations' schema differs from the checked-in file, and
# the import refuses a database whose schema differs from it. It lists every table, index, and
# trigger, including FTS5's shadow tables, but not D1's or the migration ledger's own.
set -euo pipefail
cd "$(dirname "$0")/../.."
query="SELECT type || ' ' || name || char(10) || coalesce(sql, '') AS object FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
  ORDER BY type, name"
if [ $# -eq 0 ]; then
  scratch=$(mktemp -d)
  trap 'rm -rf "$scratch"' EXIT
  pnpm exec wrangler d1 migrations apply zenbujapanese-search-local --local --persist-to "$scratch" > /dev/null
  target=(zenbujapanese-search-local --local --persist-to "$scratch")
else
  target=(SEARCH_DB --remote --config "$1")
fi
pnpm exec wrangler d1 execute "${target[@]}" --command "$query" --json |
  python3 -c 'import json, sys; print("\n\n".join(r["object"] for r in json.load(sys.stdin)[0]["results"]))'
