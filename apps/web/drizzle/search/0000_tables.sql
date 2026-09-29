CREATE TABLE `canonical_senses` (
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`parts_of_speech_json` text NOT NULL,
	PRIMARY KEY(`entry_id`, `sense_order`)
);
--> statement-breakpoint
CREATE TABLE `dictionary_import` (
	`artifact` text NOT NULL,
	`sha256` text NOT NULL,
	`transform` text NOT NULL,
	`build_id` text NOT NULL,
	`row_counts` text NOT NULL
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE `form_priority_profiles` (
	`entry_id` text NOT NULL,
	`form` text NOT NULL,
	`kind` integer NOT NULL,
	`primary_mask` integer NOT NULL,
	`secondary_mask` integer NOT NULL,
	`news_frequency_band` integer,
	PRIMARY KEY(`entry_id`, `form`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `forms` (
	`id` integer PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`form` text NOT NULL,
	`kind` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forms_form_index` ON `forms` (`form`,`entry_id`);--> statement-breakpoint
CREATE TABLE `gloss_atoms` (
	`id` integer PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`gloss_order` integer NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_form_restrictions` (
	`entry_id` text NOT NULL,
	`reading` text NOT NULL,
	`written_form` text NOT NULL,
	PRIMARY KEY(`entry_id`, `reading`, `written_form`)
);
--> statement-breakpoint
CREATE TABLE `search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`results` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sense_form_restrictions` (
	`entry_id` text NOT NULL,
	`sense_order` integer NOT NULL,
	`kind` integer NOT NULL,
	`form` text NOT NULL,
	PRIMARY KEY(`entry_id`, `sense_order`, `kind`, `form`)
);
