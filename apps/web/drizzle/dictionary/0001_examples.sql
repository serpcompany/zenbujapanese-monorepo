CREATE TABLE `word_example_counts` (
	`ent_seq` integer PRIMARY KEY NOT NULL,
	`listed` integer NOT NULL,
	`count` integer NOT NULL,
	`truncated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `word_examples` ADD `tokens_json` text;