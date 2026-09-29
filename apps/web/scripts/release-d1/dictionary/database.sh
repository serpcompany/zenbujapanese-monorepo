# The dictionary database (DICTIONARY_DB): what word and kanji pages read (issue 464, phase 2).
# Sourced by ../common.sh's load_database; see there for what each setting means. Its schema
# and import come in later PRs, so it can't be imported yet.
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
  "$resources/RadicalReferenceData.json"
  apps/web/drizzle/dictionary
  apps/web/src/db/dictionary-schema.ts
  # The detail core, which the import runs to precompute page rows.
  apps/web/src/lib/dictionary/detail
)
tables=()
upload_files=(rows.sql)
unimplemented="its import comes with issue 464's words and kanji import"

build_rows() {
  echo "The dictionary import isn't built yet ($unimplemented)" >&2
  return 1
}

check_local() {
  echo "The dictionary database has no local checks yet ($unimplemented)" >&2
  return 1
}

# The SHA-256 of each input file, for dictionary_import's `sources` column.
import_sources() {
  local file
  for file in "${lfs_inputs[@]}" "$resources/KanjiReferenceData.json" \
    "$resources/KanjiElementReferenceData.json" "$resources/RadicalReferenceData.json"; do
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
