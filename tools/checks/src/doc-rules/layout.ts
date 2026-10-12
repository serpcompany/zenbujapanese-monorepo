const rootDocs = new Set(['AGENTS.md', 'ARCHITECTURE.md', 'CONTEXT.md', 'README.md', 'CLAUDE.md'])
const docsEntries = new Set([
  'adr',
  'agents',
  'api',
  'data-sources.md',
  'harness-debt.md',
  'quality.md',
  'tech-debt.md',
  'technologies.md'
])

export const layoutAdvice =
  "isn't where docs go: how an area works goes in docs/agents/<area>.md, a decision in docs/adr/, a service's generated API reference in docs/api/, and a product's behavior in apps/<app>/docs/product/ (AGENTS.md). A new top-level doc goes in tools/checks/src/doc-rules/layout.ts first"

export function outOfLayout(path: string): boolean {
  if (!path.includes('/')) return !rootDocs.has(path)
  if (!path.startsWith('docs/')) return false
  return !docsEntries.has(path.slice('docs/'.length).split('/')[0])
}

export const namingAdvice =
  "isn't named in kebab-case: under a docs folder, name files and folders in lowercase words joined by hyphens (README.md is the one exception)"

const docsFolder = /^(?:docs|apps\/[^/]+\/docs)\/(.+)$/
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function misnamed(path: string): boolean {
  const inside = docsFolder.exec(path)?.[1]
  if (!inside) return false
  const parts = inside.split('/')
  const file = parts.pop() as string
  if (parts.some(folder => !kebab.test(folder))) return true
  return file !== 'README.md' && !kebab.test(file.replace(/\.md$/, ''))
}
