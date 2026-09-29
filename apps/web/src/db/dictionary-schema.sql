index words_id_index
CREATE UNIQUE INDEX `words_id_index` ON `words` (`id`)

table dictionary_import
CREATE TABLE `dictionary_import` (
	`artifact` text NOT NULL,
	`sha256` text NOT NULL,
	`transform` text NOT NULL,
	`build_id` text NOT NULL,
	`row_counts` text NOT NULL,
	`sources` text NOT NULL
)

table element_glyphs
CREATE TABLE `element_glyphs` (
	`glyph` text PRIMARY KEY NOT NULL,
	`alternatives_json` text NOT NULL,
	`meanings_json` text NOT NULL,
	`on_readings_json` text NOT NULL,
	`common_linked_on_readings_json` text NOT NULL,
	`containing_characters_json` text NOT NULL
)

table example_sentences
CREATE TABLE `example_sentences` (
	`id` integer PRIMARY KEY NOT NULL,
	`pair_id` text NOT NULL,
	`japanese` text NOT NULL,
	`english` text NOT NULL,
	`tokens_json` text NOT NULL,
	`japanese_tatoeba_id` integer NOT NULL,
	`japanese_contributor` text,
	`japanese_license` text NOT NULL,
	`english_tatoeba_id` integer NOT NULL,
	`english_contributor` text,
	`english_license` text NOT NULL
)

table form_examples
CREATE TABLE `form_examples` (
	`surface` text NOT NULL,
	`position` integer NOT NULL,
	`sentence_id` integer NOT NULL,
	`highlights_json` text NOT NULL,
	`links_json` text NOT NULL,
	PRIMARY KEY(`surface`, `position`)
)

table kanji
CREATE TABLE `kanji` (
	`character` text PRIMARY KEY NOT NULL,
	`stroke_count` integer NOT NULL,
	`grade` integer,
	`jlpt` integer,
	`frequency_rank` integer,
	`meanings_json` text NOT NULL,
	`readings_json` text NOT NULL,
	`components_json` text NOT NULL,
	`word_ent_seqs_json` text NOT NULL,
	`indexable` integer NOT NULL
)

table kanji_elements
CREATE TABLE `kanji_elements` (
	`character` text PRIMARY KEY NOT NULL,
	`meanings_json` text NOT NULL,
	`on_readings_json` text NOT NULL,
	`frequency_rank` integer,
	`element_glyphs_json` text NOT NULL,
	`explicit_phonetic_element` text
)

table kanji_strokes
CREATE TABLE `kanji_strokes` (
	`character` text PRIMARY KEY NOT NULL,
	`viewport_size` real NOT NULL,
	`stroke_count` integer NOT NULL,
	`strokes_json` text NOT NULL
)

table retired_ids
CREATE TABLE `retired_ids` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`replacement_ent_seq` integer
)

table word_conjugations
CREATE TABLE `word_conjugations` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`indexed_forms_json` text NOT NULL
)

table word_example_counts
CREATE TABLE `word_example_counts` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`listed` integer NOT NULL,
	`count` integer NOT NULL,
	`truncated` integer NOT NULL
)

table word_examples
CREATE TABLE `word_examples` (
	`ent_seq` integer NOT NULL,
	`position` integer NOT NULL,
	`sentence_id` integer NOT NULL,
	`highlights_json` text NOT NULL,
	`links_json` text NOT NULL, `tokens_json` text,
	PRIMARY KEY(`ent_seq`, `position`)
)

table word_sitemaps
CREATE TABLE `word_sitemaps` (
	`number` integer PRIMARY KEY NOT NULL,
	`first_ent_seq` integer NOT NULL,
	`last_ent_seq` integer NOT NULL,
	`url_count` integer NOT NULL
)

table words
CREATE TABLE `words` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`slug` text NOT NULL,
	`headword` text NOT NULL,
	`reading` text NOT NULL,
	`summary` text NOT NULL,
	`parts_of_speech_json` text NOT NULL,
	`written_forms_json` text NOT NULL,
	`reading_forms_json` text NOT NULL,
	`senses_json` text NOT NULL,
	`relationships_json` text NOT NULL,
	`pitch_json` text,
	`compound_pitch_json` text,
	`frequency_json` text NOT NULL,
	`semantic_fingerprint` text NOT NULL,
	`is_common` integer NOT NULL,
	`rank_score` integer NOT NULL
)
