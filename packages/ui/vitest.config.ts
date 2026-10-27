import { configDefaults, defineConfig } from 'vitest/config'

const interactionTests = 'src/**/*.interaction.test.tsx'

export default defineConfig({
  test: {
    testTimeout: 30_000,
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
