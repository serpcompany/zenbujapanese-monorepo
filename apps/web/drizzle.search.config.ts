import { defineConfig } from 'drizzle-kit'

// The search database (SEARCH_DB): one D1 per build of the dictionary, migrated from empty by
// the import (scripts/search-d1/ensure-release.sh). Generates SQL migrations only; see
// docs/agents/web.md.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/search-schema.ts',
  out: './drizzle/search',
  // Only the Drizzle tables: the FTS5 tables and their shadow tables live in a custom migration.
  tablesFilter: [
    'dictionary_import',
    'entries',
    'forms',
    'form_priority_profiles',
    'canonical_senses',
    'gloss_atoms',
    'sense_form_restrictions',
    'reading_form_restrictions',
    'search_cache'
  ]
})
