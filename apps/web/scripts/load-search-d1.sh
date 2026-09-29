#!/usr/bin/env bash
# Builds the dictionary search tables into a local D1 at .search-d1/ for the search
# conformance test (ZENBU_SEARCH_D1=1 pnpm test). Never targets a remote database. The build
# goes into a temporary directory and replaces .search-d1/ only once it succeeds.
set -euo pipefail
web_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_db="${1:-$web_dir/../ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3}"
# A relative source path is relative to where the script runs, not to apps/web.
source_db="$(cd "$(dirname "$source_db")" && pwd)/$(basename "$source_db")"
cd "$web_dir"
build=".search-d1.building"
rm -rf "$build" && mkdir -p "$build"
python3 scripts/build-search-d1.py "$source_db" "$build/search.sql"
pnpm exec wrangler d1 execute zenbujapanese-web-local --local --persist-to "$build" \
  --file "$build/search.sql" --yes
rm -rf .search-d1 && mv "$build" .search-d1
