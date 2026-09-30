import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const interactionTests = 'src/**/*.interaction.test.tsx'
const linksWithNextConfigTrailingSlash = { __NEXT_TRAILING_SLASH: 'true' }

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    env: linksWithNextConfigTrailingSlash,
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
