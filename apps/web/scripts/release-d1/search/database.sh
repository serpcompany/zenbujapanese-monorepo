# The search database (SEARCH_DB): the tables the search core reads, and precomputed broad
# queries. Sourced by ../common.sh's load_database; see there for what each setting means.
# shellcheck shell=bash disable=SC2034,SC2154 # Settings for, and names from, ../common.sh.

binding=SEARCH_DB
migrations_dir=drizzle/search
schema_dump=src/db/search-schema.sql
persist_dir=.search-d1
resources=apps/ios/Modules/Sources/SearchExperience/Resources
source_db=$resources/LanguageReferenceData.sqlite3
# The default frequency packs fill entry_frequency, which orders search results.
lfs_inputs=("$source_db" "$resources/JLPTLevelPack.sqlite3" "$resources/TUBELEXFrequencyPack.sqlite3")
build_inputs=(
  # Their pointers name their SHA-256.
  "${lfs_inputs[@]}"
  apps/web/drizzle/search
  apps/web/src/db/search-schema.ts
  # The search core, which precomputes search_cache.
  apps/web/src/lib/dictionary/search
  # What check_local runs the search results suite through: the results page's core, the chips
  # it draws (detail/frequency.ts), and the pack reader build-rows.py shares.
  apps/web/src/lib/dictionary/results
  apps/web/src/lib/dictionary/detail/frequency.ts
  apps/web/scripts/release-d1/dictionary/language_data.py
  # Everything else check_local's tests run or draw, but not the tests themselves (build-id.sh
  # leaves out *.test.ts and *.test.tsx): the page's component and what it draws, how the
  # rendered-page test reads it back, and the results core's links and fixtures.
  # gate-inputs.test.ts checks this list covers every file those tests import.
  apps/web/src/components/dictionary/search-results.tsx
  apps/web/src/components/dictionary/frequency.tsx
  apps/web/src/components/dictionary/ruby-text.tsx
  apps/web/src/components/dictionary/rendered.ts
  apps/web/src/components/ui/badge.tsx
  apps/web/src/components/ui/card.tsx
  apps/web/src/components/ui/empty.tsx
  apps/web/src/components/ui/item.tsx
  apps/web/src/components/ui/separator.tsx
  apps/web/src/lib/dictionary/detail/kanji.ts
  apps/web/src/lib/dictionary/detail/ruby.ts
  apps/web/src/lib/dictionary/detail/strokes.ts
  apps/web/src/lib/dictionary/detail/text.ts
  apps/web/src/lib/dictionary/fixtures
  apps/web/src/lib/dictionary/urls.ts
  # The app-recorded suites the gate checks, so a re-recorded suite checks the next deploy.
  apps/ios/LanguageData/Conformance/search-retrieval.json
  apps/ios/LanguageData/Conformance/search-results.json
)
tables=(entries forms form_priority_profiles canonical_senses gloss_atoms sense_form_restrictions
  reading_form_restrictions search_cache entry_frequency)
upload_files=(rows.sql cache.sql)

# The rows (build-rows.py), then the broad queries they make slow, precomputed through the
# search core into search_cache.
build_rows() {
  local source="$1" build="$2"
  python3 scripts/release-d1/search/build-rows.py "$source" "$repo_root/$resources" "$build/rows.sql"
  local_d1 execute "$local_name" --file "$build/rows.sql" --yes > /dev/null
  python3 scripts/release-d1/search/candidates.py "$source" "$build/candidates.json"
  pnpm exec tsx scripts/release-d1/search/precompute.mts "$build" "$build/candidates.json" "$build/cache.sql"
  if [ -s "$build/cache.sql" ]; then
    local_d1 execute "$local_name" --file "$build/cache.sql" --yes > /dev/null
  fi
}

# The app-recorded search suites, on the local copy built through the migrations: retrieval
# (ADR 0006), and the results screen after the frequency re-sort (search-results.json), both as
# data and rendered by the results page's component.
check_local() {
  # vitest.config.ts runs these one at a time: each opens the same local D1.
  ZENBU_SEARCH_D1=1 ZENBU_SEARCH_D1_PATH="$1" \
    pnpm exec vitest run src/lib/dictionary/search/conformance.test.ts \
    src/lib/dictionary/results/conformance.test.ts \
    src/components/dictionary/search-results.test.tsx
}
