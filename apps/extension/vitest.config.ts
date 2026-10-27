import { nodeAndDomProjects } from '@zenbu/ui/vitest-projects'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30_000,
    projects: [
      ...nodeAndDomProjects,
      { extends: true, test: { name: 'build', include: ['build/**/*.test.ts'] } }
    ]
  }
})
