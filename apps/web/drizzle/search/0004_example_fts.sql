-- The FTS5 indexes that find an example search's candidate sentences (#511), which Drizzle can't
-- declare. The import (scripts/release-d1/search/build-examples.mts) fills both, contentless,
-- keyed by example_sentences.id.
--
-- The app matches English queries with FTS4 tables D1 rejects: a Porter phrase, then the same
-- phrase over the `simple` tokenizer (ExampleSentenceClient.swift). example_english_fts indexes
-- each sentence's FTS4 Porter terms, computed by the import with a port of SQLite's (checked
-- against SQLite on every sentence), each spelled in hex so FTS5's `ascii` tokenizer keeps it
-- whole. A phrase of the query's terms then finds every sentence FTS4 would, long numbers
-- included; examples/search.ts checks each candidate as FTS4 does.
-- example_japanese_chars is every sentence with a space between characters, as form_chars is for
-- forms, so a phrase query finds any substring in place of the app's `instr(japanese, ?)` scan.
CREATE VIRTUAL TABLE example_english_fts USING fts5(stems, content='', tokenize='ascii');
--> statement-breakpoint
CREATE VIRTUAL TABLE example_japanese_chars USING fts5(
  chars, content='', tokenize="unicode61 remove_diacritics 0 categories 'L* M* N* P* S* Co'"
);
