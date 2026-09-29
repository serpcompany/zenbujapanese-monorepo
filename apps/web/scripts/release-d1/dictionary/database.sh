# The dictionary database (DICTIONARY_DB): what word and kanji pages read (issue 464, phase 2).
# Sourced by ../common.sh's load_database; see there for what each setting means. It holds every
# word and kanji, with stroke order, and every word's examples.
# shellcheck shell=bash disable=SC2034,SC2154 # Settings for, and names from, ../common.sh.

binding=DICTIONARY_DB
migrations_dir=drizzle/dictionary
schema_dump=src/db/dictionary-schema.sql
persist_dir=.dictionary-d1
resources=apps/ios/Modules/Sources/SearchExperience/Resources
source_db=$resources/LanguageReferenceData.sqlite3
lfs_inputs=(
  "$source_db"
  "$resources/CompoundPitch.sqlite3"
  "$resources/ExampleWordIndex.sqlite3"
  "$resources/JLPTLevelPack.sqlite3"
  "$resources/TUBELEXFrequencyPack.sqlite3"
  "$resources/KanjiStrokeData.sqlite3"
  "$resources/Kuromoji"
)
# Every input, including the Git LFS ones: their pointers name their SHA-256.
build_inputs=(
  "${lfs_inputs[@]}"
  "$resources/KanjiReferenceData.json"
  "$resources/KanjiElementReferenceData.json"
  # Not RadicalReferenceData.json: the app reads it only for radical search input, and nothing
  # here does. PR 5 or later adds it back if the kanji page starts using it.
  apps/web/drizzle/dictionary
  apps/web/src/db/dictionary-schema.ts
  # The detail core: its conformance gate (check_local) must pass on every import, so a change
  # to the core re-runs the gate by importing a new build on the next deploy.
  apps/web/src/lib/dictionary/detail
  # The example ports that precompute word_examples (build-examples.mts), and the search core
  # they look example words up with (`rankJapanese`, query normalization).
  apps/web/src/lib/dictionary/examples
  apps/web/src/lib/dictionary/search
)
tables=(words kanji kanji_strokes kanji_elements element_glyphs example_sentences word_examples
  word_example_counts retired_ids)
# examples-NN.sql: as many as build-examples.mts writes, each under 100 MB (a glob, in order).
upload_files=(rows.sql 'examples-*.sql')

# Every word and kanji (build-rows.py, from language_data.py, which the fixture export shares),
# then every word's examples (build-examples.mts: the app's retrieval, Kuromoji, and linking).
build_rows() {
  local source="$1" build="$2"
  python3 scripts/release-d1/dictionary/build-rows.py "$source" "$repo_root/$resources" \
    "$build/rows.sql"
  local_d1 execute "$local_name" --file "$build/rows.sql" --yes > /dev/null
  # node:sqlite still warns that it's experimental on Node 22.
  NODE_OPTIONS="${NODE_OPTIONS:-} --disable-warning=ExperimentalWarning" \
    pnpm exec tsx scripts/release-d1/dictionary/build-examples.mts "$source" \
    "$repo_root/$resources" "$build/examples"
  local file
  for file in "$build"/examples-*.sql; do
    local_d1 execute "$local_name" --file "$file" --yes > /dev/null
  done
}

# The app-recorded word-detail and kanji-detail suites, run through the detail core on the local
# copy built through the migrations (src/lib/dictionary/detail/conformance.test.ts).
check_local() {
  ZENBU_DICTIONARY_D1=1 ZENBU_DICTIONARY_D1_PATH="$1" \
    pnpm exec vitest run src/lib/dictionary/detail/conformance.test.ts
}

# The SHA-256 of each input file, for dictionary_import's `sources` column.
import_sources() {
  local file
  for file in "${lfs_inputs[@]}" "$resources/KanjiReferenceData.json" \
    "$resources/KanjiElementReferenceData.json"; do
    if [ -d "$repo_root/$file" ]; then
      (cd "$repo_root" && find "$file" -type f | LC_ALL=C sort | xargs sha256sum)
    else
      (cd "$repo_root" && sha256sum "$file")
    fi
  done | python3 -c '
import json, sys
print(json.dumps({path: sha for sha, path in (line.split(None, 1) for line in sys.stdin.read().splitlines())},
                 sort_keys=True, separators=(",", ":")))'
}
