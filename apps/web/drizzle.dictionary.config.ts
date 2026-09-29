import { defineConfig } from 'drizzle-kit'

// The dictionary database (DICTIONARY_DB): one D1 per build of the dictionary, migrated from
// empty by the import (`scripts/release-d1/ensure-release.sh dictionary`). Generates SQL
// migrations only; see docs/agents/web.md.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/dictionary-schema.ts',
  out: './drizzle/dictionary',
  // Only the Drizzle tables, as for the search database.
  tablesFilter: [
    'dictionary_import',
    'words',
    'kanji',
    'kanji_strokes',
    'kanji_elements',
    'element_glyphs',
    'example_sentences',
    'word_examples',
    'retired_ids'
  ]
})
