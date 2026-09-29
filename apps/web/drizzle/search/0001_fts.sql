-- The FTS5 indexes, which Drizzle can't declare. The import fills them: form_chars row by row,
-- romaji_fts from forms, and gloss_fts with a rebuild from gloss_atoms.
--
-- The app's FTS4 tables: gloss_fts used `porter` (over the simple tokenizer) and form_fts used
-- `simple`. FTS5's `porter ascii` and `ascii` tokenizers split and fold the same way, and
-- search.ts translates the app's FTS4 query syntax. One difference remains: FTS4's porter keeps
-- only the first and last 3 characters of a token with digits that is longer than 6, so the app
-- matches some long numbers that D1 doesn't (9999999 finds 99.99999999% only in the app).
-- form_chars is new: every written or reading form with a space between characters, so a phrase
-- query finds any substring, replacing the app's `instr(form, ?)` scan over every form.
CREATE VIRTUAL TABLE form_chars USING fts5(
  chars, content='', tokenize="unicode61 remove_diacritics 0 categories 'L* M* N* P* S* Co'"
);
--> statement-breakpoint
CREATE VIRTUAL TABLE gloss_fts USING fts5(
  normalized_text, content='gloss_atoms', content_rowid='id', tokenize='porter ascii'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE romaji_fts USING fts5(form, content='', tokenize='ascii');
