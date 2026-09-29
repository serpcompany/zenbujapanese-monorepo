CREATE TABLE `kanji_element_sources` (
	`snapshot` text PRIMARY KEY NOT NULL,
	`structure_source_identity` text NOT NULL,
	`metadata_source_identity` text NOT NULL,
	`metadata_source_snapshot` text NOT NULL
);
