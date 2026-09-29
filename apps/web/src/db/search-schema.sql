index forms_form_index
CREATE INDEX `forms_form_index` ON `forms` (`form`,`entry_id`)

table canonical_senses
CREATE TABLE `canonical_senses` (
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`parts_of_speech_json` text NOT NULL,
	PRIMARY KEY(`entry_id`, `sense_order`)
)

table dictionary_import
CREATE TABLE `dictionary_import` (
	`artifact` text NOT NULL,
	`sha256` text NOT NULL,
	`transform` text NOT NULL,
	`build_id` text NOT NULL,
	`row_counts` text NOT NULL
)

table entries
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_record_id` integer NOT NULL,
	`headword` text NOT NULL,
	`reading` text NOT NULL,
	`summary` text NOT NULL,
	`parts_of_speech_json` text NOT NULL,
	`is_common` integer NOT NULL,
	`rank_score` integer NOT NULL,
	`semantic_fingerprint` text NOT NULL
)

table form_chars
CREATE VIRTUAL TABLE form_chars USING fts5(
  chars, content='', tokenize="unicode61 remove_diacritics 0 categories 'L* M* N* P* S* Co'"
)

table form_chars_config
CREATE TABLE 'form_chars_config'(k PRIMARY KEY, v) WITHOUT ROWID

table form_chars_data
CREATE TABLE 'form_chars_data'(id INTEGER PRIMARY KEY, block BLOB)

table form_chars_docsize
CREATE TABLE 'form_chars_docsize'(id INTEGER PRIMARY KEY, sz BLOB)

table form_chars_idx
CREATE TABLE 'form_chars_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID

table form_priority_profiles
CREATE TABLE `form_priority_profiles` (
	`entry_id` text NOT NULL,
	`form` text NOT NULL,
	`kind` integer NOT NULL,
	`primary_mask` integer NOT NULL,
	`secondary_mask` integer NOT NULL,
	`news_frequency_band` integer,
	PRIMARY KEY(`entry_id`, `form`, `kind`)
)

table forms
CREATE TABLE `forms` (
	`id` integer PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`form` text NOT NULL,
	`kind` integer NOT NULL
)

table gloss_atoms
CREATE TABLE `gloss_atoms` (
	`id` integer PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`gloss_order` integer NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL
)

table gloss_fts
CREATE VIRTUAL TABLE gloss_fts USING fts5(
  normalized_text, content='gloss_atoms', content_rowid='id', tokenize='porter ascii'
)

table gloss_fts_config
CREATE TABLE 'gloss_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID

table gloss_fts_data
CREATE TABLE 'gloss_fts_data'(id INTEGER PRIMARY KEY, block BLOB)

table gloss_fts_docsize
CREATE TABLE 'gloss_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB)

table gloss_fts_idx
CREATE TABLE 'gloss_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID

table reading_form_restrictions
CREATE TABLE `reading_form_restrictions` (
	`entry_id` text NOT NULL,
	`reading` text NOT NULL,
	`written_form` text NOT NULL,
	PRIMARY KEY(`entry_id`, `reading`, `written_form`)
)

table romaji_fts
CREATE VIRTUAL TABLE romaji_fts USING fts5(form, content='', tokenize='ascii')

table romaji_fts_config
CREATE TABLE 'romaji_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID

table romaji_fts_data
CREATE TABLE 'romaji_fts_data'(id INTEGER PRIMARY KEY, block BLOB)

table romaji_fts_docsize
CREATE TABLE 'romaji_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB)

table romaji_fts_idx
CREATE TABLE 'romaji_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID

table search_cache
CREATE TABLE `search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`results` text NOT NULL
)

table sense_form_restrictions
CREATE TABLE `sense_form_restrictions` (
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`kind` integer NOT NULL,
	`form` text NOT NULL,
	PRIMARY KEY(`entry_id`, `sense_order`, `kind`, `form`)
)
