import { defineConfig } from 'drizzle-kit'

// Generates SQL migrations only. Apply them with the explicit `db:migrate:*` scripts, never
// `drizzle-kit push`. See docs/agents/web.md.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle'
})
