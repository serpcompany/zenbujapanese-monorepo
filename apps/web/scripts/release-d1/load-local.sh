#!/usr/bin/env bash
# shellcheck disable=SC2154 # The database's settings come from <database>/database.sh.
# Builds a release database into a local D1 (issue 464), the same way the import builds each
# release: migrations from empty, the database's own rows (<database>/database.sh's build_rows),
# then `dictionary_import` last.
#
#   scripts/release-d1/load-local.sh <search|dictionary> [LanguageReferenceData.sqlite3] [persist-dir]
#
# The persist dir defaults to the database's persist_dir (.search-d1/ for search, which the
# conformance suite reads with ZENBU_SEARCH_D1=1 pnpm test). It never targets a remote database.
# The build goes into a temporary directory and replaces the persist dir only once it succeeds;
# it keeps the SQL files there (upload_files, and import.sql) for the import to upload.
set -euo pipefail
invoked_from="$PWD"
source "$(dirname "$0")/common.sh"
load_database "${1:-}"
require_import
web_dir="$PWD"
source="${2:-$repo_root/$source_db}"
persist="${3:-$web_dir/$persist_dir}"
# Relative paths are relative to where the script runs, not to apps/web.
source="$(cd "$invoked_from" && cd "$(dirname "$source")" && pwd)/$(basename "$source")"
persist="$(cd "$invoked_from" && mkdir -p "$(dirname "$persist")" && cd "$(dirname "$persist")" && pwd)/$(basename "$persist")"

build="$persist.building"
rm -rf "$build" && mkdir -p "$build"
local_d1() { pnpm exec wrangler d1 "$@" --local --persist-to "$build"; }

local_d1 migrations apply "$local_name" > /dev/null
build_rows "$source" "$build"

# Every table's row count, recorded in dictionary_import for the deploy to check D1 against.
# One json_object: D1 limits how many SELECTs a UNION can join.
pairs=""
for table in "${tables[@]}"; do pairs+="'$table', (SELECT count(*) FROM $table), "; done
row_counts=$(local_d1 execute "$local_name" --command "SELECT json_object(${pairs%, }) AS counts" --json |
  python3 -c 'import json, sys; print(json.load(sys.stdin)[0]["results"][0]["counts"])')

transform=$(python3 -c "import sqlite3,sys; print(sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True).execute(\"SELECT value FROM metadata WHERE key = 'transform'\").fetchone()[0])" "$source")
columns="artifact, sha256, transform, build_id, row_counts"
values="$(sql_text "$(basename "$source")"),
  $(sql_text "$(sha256sum "$source" | cut -d' ' -f1)"),
  $(sql_text "$transform"),
  $(sql_text "$(scripts/release-d1/build-id.sh "$database")"),
  $(sql_text "$row_counts")"
if declare -F import_sources > /dev/null; then
  columns+=", sources"
  values+=",
  $(sql_text "$(import_sources)")"
fi
cat > "$build/import.sql" <<SQL
INSERT INTO dictionary_import ($columns) VALUES (
  $values
);
SQL
local_d1 execute "$local_name" --file "$build/import.sql" --yes > /dev/null

rm -rf "$persist" && mv "$build" "$persist"
echo "Built the $database database in $persist: $row_counts"
