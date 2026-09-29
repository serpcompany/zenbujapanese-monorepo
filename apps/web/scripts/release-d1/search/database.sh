# The search database (SEARCH_DB): the tables the search core reads, precomputed broad
# queries, and example search (#511): every Tatoeba pair, its full-text indexes, each entry's
# examples, and precomputed broad example searches. Sourced by ../common.sh's load_database; see
# there for what each setting means.
# shellcheck shell=bash disable=SC2034,SC2154 # Settings for, and names from, ../common.sh.

binding=SEARCH_DB
migrations_dir=drizzle/search
schema_dump=src/db/search-schema.sql
persist_dir=.search-d1
resources=apps/ios/Modules/Sources/SearchExperience/Resources
source_db=$resources/LanguageReferenceData.sqlite3
# build-id.sh names each input file by its path under the longest of these roots that holds it,
# after the root's name, so moving a root's files and updating its path here keeps the build ID.
input_roots=(
  "resources=$resources"
  conformance=apps/ios/LanguageData/Conformance
  web=apps/web
)
# The default frequency packs fill entry_frequency, which orders search results. Example search
# reads ExampleWordIndex (a kana headword's examples) and splits sentences with Kuromoji.
lfs_inputs=("$source_db" "$resources/JLPTLevelPack.sqlite3" "$resources/TUBELEXFrequencyPack.sqlite3"
  "$resources/ExampleWordIndex.sqlite3" "$resources/Kuromoji")
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
  # Example search: the ports that precompute it (retrieval, Kuromoji, linking, FTS4, and the
  # search itself, in examples/), the corpus reader it shares with the dictionary import, and
  # what the example-search gate reads and renders.
  apps/web/src/lib/dictionary/examples
  apps/web/scripts/release-d1/dictionary/examples-corpus.ts
  apps/web/src/lib/dictionary/detail/examples.ts
  apps/web/src/lib/dictionary/example-search.ts
  # data.ts builds the results and Example Sentences pages' data, which the gate reads through it,
  # with what it imports for the other pages.
  apps/web/src/lib/dictionary/data.ts
  apps/web/src/lib/dictionary/dictionary-db.ts
  apps/web/src/db/dictionary-schema.ts
  apps/web/src/lib/dictionary/detail/word.ts
  apps/web/src/lib/dictionary/detail/conjugation.ts
  apps/web/src/lib/dictionary/detail/kanji-split.ts
  apps/web/src/lib/dictionary/detail/part-of-speech.ts
  apps/web/src/lib/dictionary/detail/pitch.ts
  apps/web/src/lib/site.ts
  apps/web/src/components/ui/button.tsx
  apps/web/src/components/dictionary/pronounce-button.tsx
  apps/web/src/lib/dictionary/page-example.ts
  apps/web/src/components/dictionary/search-result-rows.tsx
  apps/web/src/components/dictionary/search-examples.tsx
  apps/web/src/components/dictionary/example-list.tsx
  apps/web/src/components/dictionary/load-more.tsx
  # The app-recorded suites the gate checks, so a re-recorded suite checks the next deploy.
  apps/ios/LanguageData/Conformance/search-retrieval.json
  apps/ios/LanguageData/Conformance/search-results.json
  apps/ios/LanguageData/Conformance/example-search.json
)
# The contentless example FTS5 indexes are counted by their `_docsize` shadow tables, one row per
# indexed sentence.
tables=(entries forms form_priority_profiles canonical_senses gloss_atoms sense_form_restrictions
  reading_form_restrictions search_cache entry_frequency example_sentences example_entries
  example_search_cache example_english_fts_docsize example_japanese_chars_docsize)
# examples-NN.sql: as many as build-examples.mts writes, each under 100 MB (a glob, in order).
upload_files=(rows.sql cache.sql 'examples-*.sql')

# The rows (build-rows.py), then the broad queries they make slow, precomputed through the
# search core into search_cache, then example search (build-examples.mts).
build_rows() {
  local source="$1" build="$2"
  python3 scripts/release-d1/search/build-rows.py "$source" "$repo_root/$resources" "$build/rows.sql"
  local_d1 execute "$local_name" --file "$build/rows.sql" --yes > /dev/null
  python3 scripts/release-d1/search/candidates.py "$source" "$build/candidates.json"
  pnpm exec tsx scripts/release-d1/search/precompute.mts "$build" "$build/candidates.json" "$build/cache.sql"
  if [ -s "$build/cache.sql" ]; then
    local_d1 execute "$local_name" --file "$build/cache.sql" --yes > /dev/null
  fi
  # node:sqlite still warns that it's experimental on Node 22. The build ID seeds the samples it
  # checks against the app's code, so each build draws anew.
  # Its own line, not inside the assignment below, so a failing build-id.sh stops the build
  # instead of seeding with ''.
  local seed
  seed=$(scripts/release-d1/build-id.sh search) || return
  NODE_OPTIONS="${NODE_OPTIONS:-} --disable-warning=ExperimentalWarning" \
    ZENBU_EXAMPLES_SEED="$seed" \
    pnpm exec tsx scripts/release-d1/search/build-examples.mts "$source" "$repo_root/$resources" \
    "$build/examples"
  local file
  for file in "$build"/examples-*.sql; do
    local_d1 execute "$local_name" --file "$file" --yes > /dev/null
  done
  # A file Wrangler drops without failing would leave a gap the row counts, and so the deploy's
  # verification, would inherit: every table must hold what build-examples.mts wrote.
  local_d1 execute "$local_name" --json --command "SELECT json_object(
      'example_sentences', (SELECT count(*) FROM example_sentences),
      'example_english_fts', (SELECT count(*) FROM example_english_fts_docsize),
      'example_japanese_chars', (SELECT count(*) FROM example_japanese_chars_docsize),
      'example_entries', (SELECT count(*) FROM example_entries),
      'example_search_cache', (SELECT count(*) FROM example_search_cache)) AS counts" |
    python3 -c '
import json, sys
loaded = json.loads(json.load(sys.stdin)[0]["results"][0]["counts"])
expected = json.load(open(sys.argv[1]))
if loaded != expected:
    sys.exit(f"The local build holds {loaded} example rows, but build-examples.mts wrote {expected}")
' "$build/examples-counts.json"
}

# The app-recorded search suites, on the local copy built through the migrations: retrieval
# (ADR 0006), the results screen after the frequency re-sort (search-results.json), both as data
# and rendered by the results page's component, and example search (example-search.json), as
# data and rendered by the Example Sentences page's component.
check_local() {
  # vitest.config.ts runs these one at a time: each opens the same local D1.
  ZENBU_SEARCH_D1=1 ZENBU_SEARCH_D1_PATH="$1" \
    pnpm exec vitest run src/lib/dictionary/search/conformance.test.ts \
    src/lib/dictionary/results/conformance.test.ts \
    src/components/dictionary/search-results.test.tsx \
    src/lib/dictionary/examples/conformance.test.ts \
    src/components/dictionary/search-examples.test.tsx
}
