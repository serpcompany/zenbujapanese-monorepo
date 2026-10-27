import { defineConfig } from 'vitest/config'
import { nodeAndDomProjects } from './vitest.projects'

export default defineConfig({
  test: { testTimeout: 30_000, projects: nodeAndDomProjects }
})
