CREATE TABLE `dictionary_import` (
	`artifact` text NOT NULL,
	`sha256` text NOT NULL,
	`transform` text NOT NULL,
	`build_id` text NOT NULL,
	`row_counts` text NOT NULL,
	`sources` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `element_glyphs` (
	`glyph` text PRIMARY KEY NOT NULL,
	`alternatives_json` text NOT NULL,
	`meanings_json` text NOT NULL,
	`on_readings_json` text NOT NULL,
	`common_linked_on_readings_json` text NOT NULL,
	`containing_characters_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `example_sentences` (
	`id` integer PRIMARY KEY NOT NULL,
	`pair_id` text NOT NULL,
	`japanese` text NOT NULL,
	`english` text NOT NULL,
	`tokens_json` text NOT NULL,
	`tatoeba_id` integer NOT NULL,
	`contributor` text,
	`license` text NOT NULL
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE `kanji_elements` (
	`character` text PRIMARY KEY NOT NULL,
	`meanings_json` text NOT NULL,
	`on_readings_json` text NOT NULL,
	`frequency_rank` integer,
	`element_glyphs_json` text NOT NULL,
	`explicit_phonetic_element` text
);
--> statement-breakpoint
CREATE TABLE `kanji_strokes` (
	`character` text PRIMARY KEY NOT NULL,
	`viewport_size` real NOT NULL,
	`stroke_count` integer NOT NULL,
	`strokes_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `retired_ids` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`replacement_ent_seq` integer
);
--> statement-breakpoint
CREATE TABLE `word_examples` (
	`ent_seq` integer NOT NULL,
	`position` integer NOT NULL,
	`sentence_id` integer NOT NULL,
	`highlights_json` text NOT NULL,
	`links_json` text NOT NULL,
	PRIMARY KEY(`ent_seq`, `position`)
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_id_index` ON `words` (`id`);