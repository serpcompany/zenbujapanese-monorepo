#!/bin/bash
set -euo pipefail
W=$(cd "$(dirname "$0")/../../.." && pwd)
SRC=$W/apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3
O=$W/tmp/agent/lookup-build
mkdir -p "$O"
rm -f "$O"/*.sqlite3

cp "$SRC" "$O/no-examples.sqlite3"
sqlite3 "$O/no-examples.sqlite3" <<'SQL'
DROP TABLE example_sentence_english_exact_fts;
DROP TABLE example_sentence_english_porter_fts;
DROP TABLE example_sentence_fts_map;
DROP TABLE example_sentence_provenance;
DROP TABLE example_sentence_contributors;
DROP TABLE example_sentences;
VACUUM;
SQL

cp "$O/no-examples.sqlite3" "$O/page-lookup.sqlite3"
sqlite3 "$O/page-lookup.sqlite3" <<'SQL'
DROP TABLE dictionary_form_fts;
DROP TABLE dictionary_gloss_fts;
DROP TABLE gloss_atoms;
DROP INDEX IF EXISTS entries_note_identity_index;
DROP INDEX IF EXISTS entries_semantic_fingerprint_index;
DROP INDEX IF EXISTS entries_source_provenance_index;
VACUUM;
SQL

for f in no-examples page-lookup; do
  raw=$(stat -f %z "$O/$f.sqlite3")
  gz=$(gzip -9 -c "$O/$f.sqlite3" | wc -c | tr -d ' ')
  zst=$(zstd -19 -T0 -q -c "$O/$f.sqlite3" | wc -c | tr -d ' ')
  br=$(brotli -q 9 -c "$O/$f.sqlite3" | wc -c | tr -d ' ')
  echo "$f raw=$raw gzip9=$gz zstd19=$zst brotli9=$br"
done
