import { configDefaults, type TestProjectInlineConfiguration } from 'vitest/config'

const interactionTests = 'src/**/*.interaction.test.tsx'

export const nodeAndDomProjects: TestProjectInlineConfiguration[] = [
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
