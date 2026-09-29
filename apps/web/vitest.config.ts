import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The release database gates open one local D1 from several test files, and a local D1 can't
// serve two processes at once, so with either enabled the files run one at a time.
const readsLocalD1 = process.env.ZENBU_SEARCH_D1 === '1' || process.env.ZENBU_DICTIONARY_D1 === '1'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}'], fileParallelism: !readsLocalD1 }
})
