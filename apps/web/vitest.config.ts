import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { checkoutPorts } from './e2e/server'

const interactionTests = 'src/**/*.interaction.test.tsx'
const linksWithNextConfigTrailingSlash = { __NEXT_TRAILING_SLASH: 'true' }
const againstTheDictionaryService = process.env.ZENBU_DICTIONARY_API === '1'
const thisCheckoutsDictionaryService = () => ({
  ZENBU_DICTIONARY_API_URL:
    process.env.ZENBU_DICTIONARY_API_URL ?? `http://localhost:${checkoutPorts().dictionary}`
})

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    testTimeout: 30_000,
    env: {
      ...linksWithNextConfigTrailingSlash,
      ...(againstTheDictionaryService ? thisCheckoutsDictionaryService() : {})
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, interactionTests]
        }
      },
      {
        extends: true,
        test: { name: 'happy-dom', include: [interactionTests], environment: 'happy-dom' }
      }
    ]
  }
})
