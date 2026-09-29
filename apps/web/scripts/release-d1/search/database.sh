# The search database (SEARCH_DB): the tables the search core reads, and precomputed broad
# queries. Sourced by ../common.sh's load_database; see there for what each setting means.
# shellcheck shell=bash disable=SC2034,SC2154 # Settings for, and names from, ../common.sh.

binding=SEARCH_DB
migrations_dir=drizzle/search
schema_dump=src/db/search-schema.sql
persist_dir=.search-d1
source_db=apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3
lfs_inputs=("$source_db")
build_inputs=(
  apps/web/drizzle/search
  apps/web/src/db/search-schema.ts
  # The search core, which precomputes search_cache.
  apps/web/src/lib/dictionary/search
)
tables=(entries forms form_priority_profiles canonical_senses gloss_atoms sense_form_restrictions
  reading_form_restrictions search_cache)
upload_files=(rows.sql cache.sql)

# The rows (build-rows.py), then the broad queries they make slow, precomputed through the
# search core into search_cache.
build_rows() {
  local source="$1" build="$2"
  python3 scripts/release-d1/search/build-rows.py "$source" "$build/rows.sql"
  local_d1 execute "$local_name" --file "$build/rows.sql" --yes > /dev/null
  python3 scripts/release-d1/search/candidates.py "$source" "$build/candidates.json"
  pnpm exec tsx scripts/release-d1/search/precompute.mts "$build" "$build/candidates.json" "$build/cache.sql"
  if [ -s "$build/cache.sql" ]; then
    local_d1 execute "$local_name" --file "$build/cache.sql" --yes > /dev/null
  fi
}

# The ADR 0006 conformance suite, on the local copy built through the migrations.
check_local() {
  ZENBU_SEARCH_D1=1 ZENBU_SEARCH_D1_PATH="$1" \
    pnpm exec vitest run src/lib/dictionary/search/conformance.test.ts
}
