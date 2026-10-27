import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/postcss'
import { defineConfig } from 'vite'

const testPages = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: testPages,
  css: { postcss: { plugins: [tailwindcss({ base: testPages })] } },
  server: { host: '127.0.0.1' }
})
