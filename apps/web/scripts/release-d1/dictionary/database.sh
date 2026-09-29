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
  # Everything else check_local's tests run or draw, but not the tests themselves (build-id.sh
  # leaves out *.test.ts and *.test.tsx): how the gate reads the database, and the word page's
  # components the rendered-page test draws, with how it reads them back. gate-inputs.test.ts
  # checks this list covers every file those tests import.
  apps/web/src/lib/dictionary/dictionary-db.ts
  apps/web/src/lib/dictionary/page-example.ts
  apps/web/src/lib/dictionary/urls.ts
  apps/web/src/components/dictionary/word-header.tsx
  apps/web/src/components/dictionary/conjugations.tsx
  apps/web/src/components/dictionary/example-list.tsx
  apps/web/src/components/dictionary/load-more.tsx
  apps/web/src/components/dictionary/ruby-text.tsx
  apps/web/src/components/dictionary/headword-ruby.tsx
  apps/web/src/components/dictionary/pitch-accent.tsx
  apps/web/src/components/dictionary/pronounce-button.tsx
  apps/web/src/components/dictionary/frequency-section.tsx
  apps/web/src/components/dictionary/frequency.tsx
  apps/web/src/components/dictionary/sheet.tsx
  apps/web/src/components/dictionary/rendered-word.ts
  apps/web/src/components/dictionary/rendered.ts
  apps/web/src/components/ui/badge.tsx
  apps/web/src/components/ui/button.tsx
  apps/web/src/components/ui/card.tsx
  apps/web/src/components/ui/dialog.tsx
  apps/web/src/components/ui/drawer.tsx
  apps/web/src/components/ui/separator.tsx
  apps/web/src/components/ui/tabs.tsx
  apps/web/src/hooks/use-media-query.ts
  # The app-recorded suites the gate checks, so a re-recorded suite checks the next deploy.
  apps/ios/LanguageData/Conformance/word-detail.json
  apps/ios/LanguageData/Conformance/kanji-detail.json
)
tables=(words kanji kanji_strokes kanji_elements element_glyphs example_sentences word_examples
  word_example_counts form_examples word_conjugations retired_ids word_sitemaps)
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
  # The build ID seeds which entries it checks against the app's scan, so each build draws anew.
  NODE_OPTIONS="${NODE_OPTIONS:-} --disable-warning=ExperimentalWarning" \
    ZENBU_EXAMPLES_SEED="$(scripts/release-d1/build-id.sh dictionary)" \
    pnpm exec tsx scripts/release-d1/dictionary/build-examples.mts "$source" \
    "$repo_root/$resources" "$build/examples"
  local file
  for file in "$build"/examples-*.sql; do    local_d1 execute "$local_name" --file "$file" --yes > /dev/null
  done
  # A file Wrangler drops without failing would leave a gap the row counts, and so the deploy's
  # verification, would inherit: every table must hold what build-examples.mts wrote.
  local_d1 execute "$local_name" --json --command "SELECT json_object(
      'example_sentences', (SELECT count(*) FROM example_sentences),
      'word_examples', (SELECT count(*) FROM word_examples),
      'word_example_counts', (SELECT count(*) FROM word_example_counts),
      'form_examples', (SELECT count(*) FROM form_examples),
      'word_conjugations', (SELECT count(*) FROM word_conjugations)) AS counts" |
    python3 -c '
import json, sys
loaded = json.loads(json.load(sys.stdin)[0]["results"][0]["counts"])
expected = json.load(open(sys.argv[1]))
if loaded != expected:
    sys.exit(f"The local build holds {loaded} example rows, but build-examples.mts wrote {expected}")
' "$build/examples-counts.json"
}

# The app-recorded word-detail and kanji-detail suites, run through the detail core on the local
# copy built through the migrations (src/lib/dictionary/detail/conformance.test.ts), with every
# example each conjugated form's screen lists, and the word-detail suite drawn by the word page's
# components (word-page.test.tsx): the furigana's per-kanji split, the pitch graph's dots, each
# Frequency row's details, and the conjugation table's page with each form's page and its
# examples (conjugations.test.tsx).
check_local() {
  # vitest.config.ts runs these one at a time: each opens the same local D1.
  ZENBU_DICTIONARY_D1=1 ZENBU_DICTIONARY_D1_PATH="$1" \
    pnpm exec vitest run src/lib/dictionary/detail/conformance.test.ts \
    src/components/dictionary/word-page.test.tsx \
    src/components/dictionary/conjugations.test.tsx
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
