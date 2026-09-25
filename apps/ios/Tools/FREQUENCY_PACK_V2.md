# Frequency Pack v2

Frequency Pack v2 supports sources such as JPDB that publish an explicit rank
and stable JMdict-compatible source record ID but do not publish occurrence
counts or total token counts.

V1 remains unchanged. Its source contract is form/count based, maps through
`FrequencyPackMappingV1.sql`, and requires a corpus token total. V2 uses these
source columns:

| Column | Required | Meaning |
| --- | --- | --- |
| `rank` | Yes | JPDB `Top N` band upper bound. Equal values remain tied. |
| `source_record_id` | Yes | Stable JPDB/JMdict VID (`ent_seq`). |
| `source_count` | No | Occurrence count, only when the source actually supplies it for every row. |

`FrequencyPackMappingV2.sql` joins `source_record_id` directly to
`LanguageReference.entries.source_record_id` for `edrdg.jmdict`. It does not
guess from spellings or parts of speech. For JPDB, the UI renders `Top N`
rather than the misleading `#N`; percentile is explicitly approximate because
the source bands many entries together. Counts and total tokens
remain absent when unavailable.

## Prepare a JPDB draft

From a completed normalized JPDB SQLite export:

```sh
python3 apps/ios/Tools/export_jpdb_frequency_pack.py \
  --jpdb-sqlite /absolute/path/JPDB.sqlite \
  --corpus global \
  --pack-id zenbu.jpdb.global.ja \
  --pack-version YYYY-MM-DD \
  --display-name "JPDB Global" \
  --domain mixed.jpdb \
  --domain-description "Japanese across JPDB's indexed public media corpus." \
  --source-identity "JPDB global rank" \
  --source-snapshot SNAPSHOT_SHA256 \
  --retrieved-at YYYY-MM-DD \
  --authorization apps/ios/LanguageData/Sources/JPDB.owner-authorization.json \
  --output-source /external/path/JPDB-global.tsv.xz \
  --output-manifest /external/path/JPDB-global.source.json \
  --output-catalog-draft /external/path/JPDB-global.catalog-draft.json
```

The exporter also accepts `--input-tsv` with the same columns, which is the
handoff for a MySQL query/export. The resulting manifest and catalog entry are
explicit drafts with `distributionAllowed: false` and unconfirmed rights.
They must not be added to `FrequencyPackCatalog.json` until redistribution
rights, attribution, download location, mapping totals, and artifact checksums
are finalized.

Build the deterministic offline artifact with the existing version-dispatching
importer:

```sh
python3 apps/ios/Tools/import_frequency_pack.py \
  --source /external/path/JPDB-global.tsv.xz \
  --source-manifest /external/path/JPDB-global.source.json \
  --language-data apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3 \
  --output /external/path/JPDBFrequencyPack.sqlite3 \
  --output-manifest /external/path/JPDBFrequencyPack.import.json
```

Per-corpus packs use the same contract with a different `--corpus`, pack ID,
domain description, and source identity.
