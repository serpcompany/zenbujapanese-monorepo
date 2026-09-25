ATTACH DATABASE '{{LANGUAGE_DATA_PATH}}' AS language;
CREATE TEMP TABLE resolutions AS
SELECT
  source_rows.source_record_id,
  source_rows.rank,
  source_rows.source_count,
  source_rows.source_record_digest,
  entries.id AS language_reference_id,
  entries.headword AS matched_form
FROM source_rows
LEFT JOIN language.entries
  ON entries.source_identity = 'edrdg.jmdict'
 AND entries.source_record_id = source_rows.source_record_id;

INSERT INTO frequency_evidence
SELECT
  language_reference_id,
  rank,
  source_count,
  {{COVERED_SOURCE_ROWS}},
  'sourceRecordID',
  matched_form,
  '',
  source_record_digest,
  source_record_id
FROM resolutions
WHERE language_reference_id IS NOT NULL;
