import { nodeAndDomProjects } from '@zenbu/ui/vitest-projects'
import { defineConfig } from 'vitest/config'
import { defaultEnvironment, hostDefines } from './build/hosts.ts'

export default defineConfig({
  define: hostDefines(defaultEnvironment),
  test: {
    testTimeout: 30_000,
    projects: [
      ...nodeAndDomProjects,
      { extends: true, test: { name: 'build', include: ['build/**/*.test.ts'] } },
      { extends: true, test: { name: 'agent-chrome', include: ['agent-chrome/*.test.mjs'] } }
    ]
  }
})
