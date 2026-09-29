CREATE TABLE `example_entries` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`ent_seq` integer NOT NULL,
	`written_forms_json` text NOT NULL,
	`reading_forms_json` text NOT NULL,
	`sentence_ids_json` text
);
--> statement-breakpoint
CREATE TABLE `example_search_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`truncated` integer NOT NULL,
	`sentence_ids_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `example_sentences` (
	`id` integer PRIMARY KEY NOT NULL,
	`pair_id` text NOT NULL,
	`japanese` text NOT NULL,
	`english` text NOT NULL,
	`words_json` text NOT NULL,
	`japanese_tatoeba_id` integer NOT NULL,
	`japanese_contributor` text,
	`japanese_license` text NOT NULL,
	`english_tatoeba_id` integer NOT NULL,
	`english_contributor` text,
	`english_license` text NOT NULL
);
