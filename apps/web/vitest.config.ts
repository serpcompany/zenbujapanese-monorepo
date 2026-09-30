import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Links keep their trailing slash, as next.config.ts's `trailingSlash` has the build draw them.
    env: { __NEXT_TRAILING_SLASH: 'true' }
  }
})
