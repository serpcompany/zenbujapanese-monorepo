#!/usr/bin/env bash
# Builds the dictionary search tables into a local D1 at .search-d1/ for the search
# conformance test (ZENBU_SEARCH_D1=1 pnpm test). Never targets a remote database.
set -euo pipefail
cd "$(dirname "$0")/.."
source_db="${1:-../ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3}"
sql=".search-d1/search.sql"
rm -rf .search-d1 && mkdir -p .search-d1
python3 scripts/build-search-d1.py "$source_db" "$sql"
pnpm exec wrangler d1 execute zenbujapanese-web-local --local --persist-to .search-d1 --file "$sql" --yes
