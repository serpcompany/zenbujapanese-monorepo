#!/usr/bin/env bash
# shellcheck disable=SC2154 # The database's settings come from <database>/database.sh.
# A release database's schema as it is, for comparing with its schema dump (such as
# src/db/search-schema.sql).
#
#   scripts/release-d1/schema.sh <database>            the schema its migrations build, on an empty local D1
#   scripts/release-d1/schema.sh <database> <config>   the schema of the D1 named in <config>, remotely
#
# `pnpm db:check` fails when the migrations' schema differs from the checked-in dump, and the
# import refuses a database whose schema differs from it. It lists every table, index, and
# trigger, including FTS5's shadow tables, but not D1's or the migration ledger's own.
set -euo pipefail
source "$(dirname "$0")/common.sh"
load_database "${1:-}"
shift
query="SELECT type || ' ' || name || char(10) || coalesce(sql, '') AS object FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
  ORDER BY type, name"
if [ $# -eq 0 ]; then
  scratch=$(mktemp -d)
  trap 'rm -rf "$scratch"' EXIT
  wrangler d1 migrations apply "$local_name" --local --persist-to "$scratch" > /dev/null
  target=("$local_name" --local --persist-to "$scratch")
else
  target=("$binding" --remote --config "$1")
fi
wrangler d1 execute "${target[@]}" --command "$query" --json |
  python3 -c 'import json, sys; print("\n\n".join(r["object"] for r in json.load(sys.stdin)[0]["results"]))'
