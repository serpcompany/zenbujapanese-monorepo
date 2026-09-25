CREATE TABLE IF NOT EXISTS schema_migrations (
  version BIGINT UNSIGNED PRIMARY KEY,
  checksum BINARY(32) NOT NULL,
  applied_at DATETIME(6) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jpdb_snapshots (
  snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  snapshot_sha BINARY(32) NOT NULL UNIQUE,
  manifest_sha BINARY(32) NOT NULL,
  artifact_sha BINARY(32) NOT NULL,
  authorization_sha BINARY(32) NOT NULL,
  discovery_mode VARCHAR(64) COLLATE utf8mb4_0900_bin NOT NULL,
  scope_text TEXT COLLATE utf8mb4_0900_bin NOT NULL,
  extract_root_uri TEXT COLLATE utf8mb4_0900_bin NOT NULL,
  frontend_closure JSON,
  state ENUM('loading','validated','published','failed') NOT NULL,
  is_full_jpdb BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL,
  validated_at DATETIME(6),
  published_at DATETIME(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_current_snapshot (
  source_name VARCHAR(64) COLLATE utf8mb4_0900_bin PRIMARY KEY,
  snapshot_id BIGINT UNSIGNED NOT NULL,
  switched_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_current_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_snapshot_table_manifests (
  snapshot_id BIGINT UNSIGNED NOT NULL,
  table_name VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
  row_count BIGINT UNSIGNED NOT NULL,
  content_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,table_name),
  CONSTRAINT fk_table_manifest_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_extracted_documents (
  document_sha BINARY(32) PRIMARY KEY,
  schema_name VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
  schema_version INT UNSIGNED NOT NULL,
  route_type VARCHAR(64) COLLATE utf8mb4_0900_bin NOT NULL,
  canonical_json JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_source_resources (
  snapshot_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,
  requested_url LONGTEXT COLLATE utf8mb4_0900_bin NOT NULL,
  requested_url_sha BINARY(32) NOT NULL,
  final_url LONGTEXT COLLATE utf8mb4_0900_bin NOT NULL,
  canonical_url LONGTEXT COLLATE utf8mb4_0900_bin,
  retrieved_at VARCHAR(64) COLLATE utf8mb4_0900_bin NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  content_type VARCHAR(255) COLLATE utf8mb4_0900_bin NOT NULL,
  response_byte_count BIGINT UNSIGNED NOT NULL,
  response_content_sha BINARY(32) NOT NULL,
  extracted_document_sha BINARY(32) NOT NULL,
  extracted_compression VARCHAR(32) COLLATE utf8mb4_0900_bin NOT NULL,
  extracted_schema VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
  extracted_schema_version INT UNSIGNED NOT NULL,
  etag TEXT COLLATE utf8mb4_0900_bin,
  last_modified TEXT COLLATE utf8mb4_0900_bin,
  attempts INT UNSIGNED NOT NULL,
  discovered_from_url_sha BINARY(32),
  PRIMARY KEY(snapshot_id,local_id),
  UNIQUE(snapshot_id,requested_url_sha),
  CONSTRAINT fk_resource_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_document FOREIGN KEY(extracted_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_closure_checks (
  snapshot_id BIGINT UNSIGNED NOT NULL,
  listing_path_sha BINARY(32) NOT NULL,
  listing_path LONGTEXT COLLATE utf8mb4_0900_bin NOT NULL,
  listing_kind ENUM('difficulty','vocabulary') NOT NULL,
  expected_count BIGINT UNSIGNED,
  covered_positions BIGINT UNSIGNED NOT NULL,
  observed_ids BIGINT UNSIGNED NOT NULL,
  closed BOOLEAN NOT NULL,
  PRIMARY KEY(snapshot_id,listing_path_sha),
  CONSTRAINT fk_closure_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_vocabulary (
  snapshot_id BIGINT UNSIGNED NOT NULL, local_id BIGINT UNSIGNED NOT NULL,
  upstream_vid BIGINT UNSIGNED NOT NULL, headword VARCHAR(512) NOT NULL,
  primary_reading VARCHAR(512) NOT NULL,
  PRIMARY KEY(snapshot_id,local_id), UNIQUE(snapshot_id,upstream_vid),
  CONSTRAINT fk_vocab_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_spellings (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  spelling VARCHAR(512) NOT NULL, reading VARCHAR(512) NOT NULL, weight DOUBLE,
  is_primary BOOLEAN NOT NULL, form_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,form_sha),
  INDEX idx_jpdb_spelling(snapshot_id,spelling(191),reading(191)),
  CONSTRAINT fk_spelling_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_readings (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  reading VARCHAR(512) NOT NULL, is_primary BOOLEAN NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,reading),
  CONSTRAINT fk_reading_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_meanings (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  ordinal INT UNSIGNED NOT NULL, meaning TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,ordinal),
  CONSTRAINT fk_meaning_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_meaning_parts_of_speech (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  meaning_ordinal INT UNSIGNED NOT NULL, part_of_speech VARCHAR(255) NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,meaning_ordinal,part_of_speech),
  CONSTRAINT fk_pos_meaning FOREIGN KEY(snapshot_id,vocabulary_id,meaning_ordinal) REFERENCES jpdb_meanings(snapshot_id,vocabulary_id,ordinal) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_pronunciations (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(64) NOT NULL, value_sha BINARY(32) NOT NULL, value_text TEXT NOT NULL,
  audio_path VARCHAR(1024),
  PRIMARY KEY(snapshot_id,vocabulary_id,kind,value_sha),
  CONSTRAINT fk_pronunciation_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_frequencies (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  corpus VARCHAR(255) NOT NULL, frequency_rank BIGINT UNSIGNED NOT NULL,
  rank_semantics VARCHAR(64) NOT NULL, display_text VARCHAR(128) NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,corpus),
  INDEX idx_jpdb_frequency_rank(snapshot_id,corpus,frequency_rank,vocabulary_id),
  CONSTRAINT fk_frequency_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_kanji (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  meaning TEXT NOT NULL, keyword_text TEXT NOT NULL, mnemonic_text TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,character_text),
  CONSTRAINT fk_kanji_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_components (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  component_text VARCHAR(8) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,component_text),
  CONSTRAINT fk_component_kanji FOREIGN KEY(snapshot_id,character_text) REFERENCES jpdb_kanji(snapshot_id,character_text) ON DELETE CASCADE,
  CONSTRAINT fk_component_value FOREIGN KEY(snapshot_id,component_text) REFERENCES jpdb_kanji(snapshot_id,character_text) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_example_sentences (
  snapshot_id BIGINT UNSIGNED NOT NULL, local_id BIGINT UNSIGNED NOT NULL,
  japanese TEXT NOT NULL, english TEXT NOT NULL, audio_path VARCHAR(1024),
  PRIMARY KEY(snapshot_id,local_id),
  CONSTRAINT fk_example_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_vocabulary_examples (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  example_id BIGINT UNSIGNED NOT NULL, ordinal INT UNSIGNED NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id,example_id),
  CONSTRAINT fk_vocab_example_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE,
  CONSTRAINT fk_vocab_example_example FOREIGN KEY(snapshot_id,example_id) REFERENCES jpdb_example_sentences(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_media (
  snapshot_id BIGINT UNSIGNED NOT NULL, local_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(64) NOT NULL, upstream_id BIGINT UNSIGNED NOT NULL,
  slug VARCHAR(512) NOT NULL, title TEXT NOT NULL, canonical_url LONGTEXT NOT NULL,
  PRIMARY KEY(snapshot_id,local_id), UNIQUE(snapshot_id,category,upstream_id),
  CONSTRAINT fk_media_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_decks (
  snapshot_id BIGINT UNSIGNED NOT NULL, local_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED, name TEXT NOT NULL, canonical_url LONGTEXT NOT NULL,
  canonical_url_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,local_id), UNIQUE(snapshot_id,canonical_url_sha),
  CONSTRAINT fk_deck_media FOREIGN KEY(snapshot_id,media_id) REFERENCES jpdb_media(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_deck_vocabulary (
  snapshot_id BIGINT UNSIGNED NOT NULL, deck_id BIGINT UNSIGNED NOT NULL,
  position_number BIGINT UNSIGNED NOT NULL, upstream_vid BIGINT UNSIGNED NOT NULL,
  vocabulary_id BIGINT UNSIGNED, occurrences BIGINT UNSIGNED,
  spelling VARCHAR(512) NOT NULL, reading VARCHAR(512) NOT NULL,
  meanings_json JSON NOT NULL, tags_json JSON NOT NULL, frequencies_json JSON NOT NULL,
  numeric_evidence_json JSON NOT NULL,
  PRIMARY KEY(snapshot_id,deck_id,position_number),
  INDEX idx_deck_vocabulary_vid(snapshot_id,upstream_vid),
  CONSTRAINT fk_deck_vocab_deck FOREIGN KEY(snapshot_id,deck_id) REFERENCES jpdb_decks(snapshot_id,local_id) ON DELETE CASCADE,
  CONSTRAINT fk_deck_vocab_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_vocabulary_relations (
  snapshot_id BIGINT UNSIGNED NOT NULL, source_vocabulary_id BIGINT UNSIGNED NOT NULL,
  target_vocabulary_id BIGINT UNSIGNED NOT NULL, relation VARCHAR(128) NOT NULL,
  PRIMARY KEY(snapshot_id,source_vocabulary_id,target_vocabulary_id,relation),
  CONSTRAINT fk_relation_source FOREIGN KEY(snapshot_id,source_vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE,
  CONSTRAINT fk_relation_target FOREIGN KEY(snapshot_id,target_vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_upstream_identifiers (
  snapshot_id BIGINT UNSIGNED NOT NULL, entity_type VARCHAR(64) NOT NULL,
  entity_key VARBINARY(512) NOT NULL, namespace VARCHAR(128) NOT NULL,
  upstream_id TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,entity_type,entity_key,namespace),
  CONSTRAINT fk_identifier_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_zenbu_mappings (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  zenbu_entry_id VARBINARY(64), status ENUM('mapped','ambiguous','unmapped') NOT NULL,
  candidate_count BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY(snapshot_id,vocabulary_id),
  CONSTRAINT fk_mapping_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_field_provenance (
  observation_sha BINARY(32) NOT NULL, snapshot_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(64) NOT NULL, entity_key VARBINARY(512) NOT NULL,
  field_name VARCHAR(128) NOT NULL, source_resource_id BIGINT UNSIGNED NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,observation_sha),
  CONSTRAINT fk_provenance_resource FOREIGN KEY(snapshot_id,source_resource_id) REFERENCES jpdb_source_resources(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_conflicts (
  conflict_sha BINARY(32) NOT NULL, snapshot_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(64) NOT NULL, entity_key VARBINARY(512) NOT NULL,
  field_name VARCHAR(128) NOT NULL, values_json JSON NOT NULL,
  PRIMARY KEY(snapshot_id,conflict_sha),
  CONSTRAINT fk_conflict_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_validation_issues (
  issue_sha BINARY(32) NOT NULL, snapshot_id BIGINT UNSIGNED NOT NULL,
  source_resource_id BIGINT UNSIGNED NOT NULL, issue_kind VARCHAR(128) NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,issue_sha),
  CONSTRAINT fk_issue_resource FOREIGN KEY(snapshot_id,source_resource_id) REFERENCES jpdb_source_resources(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_source_licenses (
  snapshot_id BIGINT UNSIGNED NOT NULL, local_id BIGINT UNSIGNED NOT NULL,
  source_name VARCHAR(255) NOT NULL, authorization_sha BINARY(32) NOT NULL,
  scope_text TEXT NOT NULL, redistribution_allowed BOOLEAN NOT NULL, note TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,local_id),
  CONSTRAINT fk_license_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_frontend_decks (
  snapshot_id BIGINT UNSIGNED NOT NULL,
  deck_key_sha BINARY(32) NOT NULL,
  deck_key TEXT COLLATE utf8mb4_0900_bin NOT NULL,
  category VARCHAR(64) NOT NULL,
  upstream_media_id BIGINT UNSIGNED NOT NULL,
  media_slug VARCHAR(512) NOT NULL,
  deck_kind ENUM('aggregate','subdeck') NOT NULL,
  deck_ordinal BIGINT,
  deck_slug VARCHAR(512),
  title TEXT NOT NULL,
  vocabulary_list_url TEXT NOT NULL,
  source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,deck_key_sha,source_document_sha),
  CONSTRAINT fk_frontend_deck_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_frontend_deck_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_media_metrics (
  snapshot_id BIGINT UNSIGNED NOT NULL, media_id BIGINT UNSIGNED NOT NULL,
  metric_ordinal INT UNSIGNED NOT NULL,
  metric_name VARCHAR(255) NOT NULL, metric_value TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,media_id,metric_ordinal),
  CONSTRAINT fk_media_metric_media FOREIGN KEY(snapshot_id,media_id) REFERENCES jpdb_media(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_deck_listing_rows (
  snapshot_id BIGINT UNSIGNED NOT NULL, deck_key_sha BINARY(32) NOT NULL,
  position_number BIGINT UNSIGNED NOT NULL, row_ordinal INT UNSIGNED NOT NULL,
  upstream_vid BIGINT UNSIGNED NOT NULL, spelling VARCHAR(512) NOT NULL,
  reading VARCHAR(512) NOT NULL, occurrences BIGINT UNSIGNED,
  meanings_json JSON NOT NULL, tags_json JSON NOT NULL, frequencies_json JSON NOT NULL,
  numeric_evidence_json JSON NOT NULL,
  source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,deck_key_sha,position_number,row_ordinal),
  INDEX idx_listing_vid(snapshot_id,upstream_vid),
  CONSTRAINT fk_listing_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_listing_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_deck_metrics (
  snapshot_id BIGINT UNSIGNED NOT NULL, deck_id BIGINT UNSIGNED NOT NULL,
  metric_ordinal INT UNSIGNED NOT NULL, metric_name VARCHAR(255) NOT NULL,
  metric_value TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,deck_id,metric_ordinal),
  CONSTRAINT fk_deck_metric_deck FOREIGN KEY(snapshot_id,deck_id) REFERENCES jpdb_decks(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_vocabulary_media_appearances (
  snapshot_id BIGINT UNSIGNED NOT NULL, upstream_vid BIGINT UNSIGNED NOT NULL,
  category VARCHAR(64) NOT NULL, upstream_media_id BIGINT UNSIGNED NOT NULL,
  media_slug VARCHAR(512) NOT NULL, title TEXT NOT NULL, used_times BIGINT UNSIGNED,
  media_url TEXT NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,upstream_vid,category,upstream_media_id,source_document_sha),
  CONSTRAINT fk_appearance_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_appearance_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_vocabulary_usage_summary (
  snapshot_id BIGINT UNSIGNED NOT NULL, vocabulary_id BIGINT UNSIGNED NOT NULL,
  used_in_media_count BIGINT UNSIGNED,
  PRIMARY KEY(snapshot_id,vocabulary_id),
  CONSTRAINT fk_usage_summary_vocab FOREIGN KEY(snapshot_id,vocabulary_id) REFERENCES jpdb_vocabulary(snapshot_id,local_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_kanji_details (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  keyword_text TEXT NOT NULL, meanings_json JSON NOT NULL, mnemonic_text TEXT NOT NULL,
  pronunciation_audio_json JSON NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,source_document_sha),
  CONSTRAINT fk_kanji_detail_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_detail_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_readings (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  reading_ordinal INT UNSIGNED NOT NULL, reading_text VARCHAR(512) NOT NULL,
  reading_url TEXT NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,source_document_sha,reading_ordinal),
  CONSTRAINT fk_kanji_reading_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_reading_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_reading_details (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  reading_text VARCHAR(512) NOT NULL, frequency_percent DOUBLE,
  used_in_total BIGINT UNSIGNED, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,reading_text,source_document_sha),
  CONSTRAINT fk_kanji_reading_detail_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_reading_detail_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_reading_vocabulary (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  reading_text VARCHAR(512) NOT NULL, position_number BIGINT UNSIGNED NOT NULL,
  upstream_vid BIGINT UNSIGNED NOT NULL, spelling VARCHAR(512) NOT NULL,
  vocabulary_reading VARCHAR(512) NOT NULL, meaning_text TEXT NOT NULL,
  detail_url TEXT NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,reading_text,position_number,source_document_sha),
  INDEX idx_kanji_reading_vocabulary_vid(snapshot_id,upstream_vid),
  CONSTRAINT fk_kanji_reading_vocab_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_reading_vocab_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_attributes (
  snapshot_id BIGINT UNSIGNED NOT NULL, character_text VARCHAR(8) NOT NULL,
  attribute_ordinal INT UNSIGNED NOT NULL, attribute_name VARCHAR(255) NOT NULL,
  attribute_value TEXT NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,character_text,source_document_sha,attribute_ordinal),
  CONSTRAINT fk_kanji_attribute_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_attribute_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_kanji_frontend_relations (
  snapshot_id BIGINT UNSIGNED NOT NULL, source_character VARCHAR(8) NOT NULL,
  relation_type ENUM('component','used-in-kanji','used-in-vocabulary') NOT NULL,
  target_key VARCHAR(64) NOT NULL, description_text TEXT NOT NULL,
  relation_ordinal INT UNSIGNED NOT NULL, source_document_sha BINARY(32) NOT NULL,
  PRIMARY KEY(snapshot_id,source_character,source_document_sha,relation_type,relation_ordinal),
  CONSTRAINT fk_kanji_relation_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_kanji_relation_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS jpdb_document_external_links (
  snapshot_id BIGINT UNSIGNED NOT NULL, source_document_sha BINARY(32) NOT NULL,
  link_ordinal INT UNSIGNED NOT NULL, link_text TEXT NOT NULL, link_url TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,source_document_sha,link_ordinal),
  CONSTRAINT fk_external_link_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_external_link_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_document_images (
  snapshot_id BIGINT UNSIGNED NOT NULL, source_document_sha BINARY(32) NOT NULL,
  image_ordinal INT UNSIGNED NOT NULL, image_url TEXT NOT NULL, alt_text TEXT NOT NULL,
  title_text TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,source_document_sha,image_ordinal),
  CONSTRAINT fk_image_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_image_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS jpdb_document_diagnostics (
  snapshot_id BIGINT UNSIGNED NOT NULL, source_document_sha BINARY(32) NOT NULL,
  visible_text_sha BINARY(32) NOT NULL,
  headings_json JSON NOT NULL, tables_json JSON NOT NULL, metadata_json JSON NOT NULL,
  unparsed_evidence_json JSON NOT NULL,
  PRIMARY KEY(snapshot_id,source_document_sha),
  CONSTRAINT fk_diagnostic_snapshot FOREIGN KEY(snapshot_id) REFERENCES jpdb_snapshots(snapshot_id) ON DELETE CASCADE,
  CONSTRAINT fk_diagnostic_document FOREIGN KEY(source_document_sha) REFERENCES jpdb_extracted_documents(document_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
