CREATE TABLE `form_examples` (
	`surface` text NOT NULL,
	`position` integer NOT NULL,
	`sentence_id` integer NOT NULL,
	`highlights_json` text NOT NULL,
	`links_json` text NOT NULL,
	PRIMARY KEY(`surface`, `position`)
);
--> statement-breakpoint
CREATE TABLE `word_conjugations` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`indexed_forms_json` text NOT NULL
);
