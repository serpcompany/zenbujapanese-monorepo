#!/usr/bin/env bash
# Builds the search database into a local D1 (issue 464), the same way the import builds each
# release: migrations from empty, rows, precomputed broad queries, then `dictionary_import` last.
#
#   scripts/search-d1/load-local.sh [LanguageReferenceData.sqlite3] [persist-dir]
#
# The persist dir defaults to .search-d1/, which the conformance suite reads
# (ZENBU_SEARCH_D1=1 pnpm test). It never targets a remote database. The build goes into a
# temporary directory and replaces the persist dir only once it succeeds; it keeps rows.sql and
# cache.sql there for the import to upload.
set -euo pipefail
web_dir="$(cd "$(dirname "$0")/../.." && pwd)"
source_db="${1:-$web_dir/../ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3}"
persist="${2:-$web_dir/.search-d1}"
# Relative paths are relative to where the script runs, not to apps/web.
source_db="$(cd "$(dirname "$source_db")" && pwd)/$(basename "$source_db")"
mkdir -p "$(dirname "$persist")"
persist="$(cd "$(dirname "$persist")" && pwd)/$(basename "$persist")"
cd "$web_dir"

build="$persist.building"
rm -rf "$build" && mkdir -p "$build"
d1() { pnpm exec wrangler d1 "$@" --local --persist-to "$build"; }

d1 migrations apply zenbujapanese-search-local > /dev/null
python3 scripts/search-d1/build-rows.py "$source_db" "$build/rows.sql"
d1 execute zenbujapanese-search-local --file "$build/rows.sql" --yes > /dev/null
python3 scripts/search-d1/candidates.py "$source_db" "$build/candidates.json"
pnpm exec tsx scripts/search-d1/precompute.mts "$build" "$build/candidates.json" "$build/cache.sql"
if [ -s "$build/cache.sql" ]; then
  d1 execute zenbujapanese-search-local --file "$build/cache.sql" --yes > /dev/null
fi

# Every table's row count, recorded in dictionary_import for the deploy to check D1 against.
# One json_object: D1 limits how many SELECTs a UNION can join.
tables=(entries forms form_priority_profiles canonical_senses gloss_atoms sense_form_restrictions
  reading_form_restrictions search_cache)
pairs=""
for table in "${tables[@]}"; do pairs+="'$table', (SELECT count(*) FROM $table), "; done
row_counts=$(d1 execute zenbujapanese-search-local --command "SELECT json_object(${pairs%, }) AS counts" --json |
  python3 -c 'import json, sys; print(json.load(sys.stdin)[0]["results"][0]["counts"])')

sql_text() { printf "'%s'" "${1//\'/\'\'}"; }
transform=$(python3 -c "import sqlite3,sys; print(sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True).execute(\"SELECT value FROM metadata WHERE key = 'transform'\").fetchone()[0])" "$source_db")
cat > "$build/import.sql" <<SQL
INSERT INTO dictionary_import (artifact, sha256, transform, build_id, row_counts) VALUES (
  $(sql_text "$(basename "$source_db")"),
  $(sql_text "$(sha256sum "$source_db" | cut -d' ' -f1)"),
  $(sql_text "$transform"),
  $(sql_text "$(scripts/search-d1/build-id.sh)"),
  $(sql_text "$row_counts")
);
SQL
d1 execute zenbujapanese-search-local --file "$build/import.sql" --yes > /dev/null

rm -rf "$persist" && mv "$build" "$persist"
echo "Built the search database in $persist: $row_counts"
