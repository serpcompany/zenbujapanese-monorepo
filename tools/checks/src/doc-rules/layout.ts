const rootDocs = new Set(['AGENTS.md', 'ARCHITECTURE.md', 'CONTEXT.md', 'README.md', 'CLAUDE.md'])
const docsEntries = new Set([
  'adr',
  'agents',
  'data-sources.md',
  'quality.md',
  'tech-debt.md',
  'technologies.md'
])

export const layoutAdvice =
  "isn't where docs go: how an area works goes in docs/agents/<area>.md, a decision in docs/adr/, and a product's behavior in apps/<app>/docs/product/ (AGENTS.md). A new top-level doc goes in tools/checks/src/doc-rules/layout.ts first"

export function outOfLayout(path: string): boolean {
  if (!path.includes('/')) return !rootDocs.has(path)
  if (!path.startsWith('docs/')) return false
  return !docsEntries.has(path.slice('docs/'.length).split('/')[0])
}

export const agentsLineLimit = 120
