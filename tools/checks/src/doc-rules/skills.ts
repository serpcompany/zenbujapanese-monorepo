import { posix } from 'node:path'
import { parse } from 'yaml'

export const skillCatalog = 'docs/agents/code.md'
const descriptionLimit = 1024

const skillFolder = (path: string) =>
  path.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? null

function frontmatter(text: string): unknown {
  const match = text.match(/^---\n([\s\S]*?)\n---(\n|$)/)
  if (!match) return null
  try {
    return parse(match[1])
  } catch {
    return null
  }
}

export function skillProblems(path: string, text: string, catalogLinks: readonly string[]) {
  const folder = skillFolder(path)
  if (!folder) return []
  const fields = frontmatter(text)
  if (!fields || typeof fields !== 'object') {
    return ['has no YAML frontmatter between --- lines, which Claude Code reads the skill from']
  }
  const { name, description } = fields as { name?: unknown; description?: unknown }
  const problems: string[] = []
  if (name !== folder) problems.push(`is named ${String(name)}, not ${folder}, its folder's name`)
  if (typeof description !== 'string' || !description.trim()) {
    problems.push('has no description, which is how an agent knows when to use it')
  } else if (description.length > descriptionLimit) {
    problems.push(`has a description over ${descriptionLimit} characters`)
  }
  if (!catalogLinks.includes(posix.normalize(path))) {
    problems.push(`isn't listed in ${skillCatalog}'s Skills table`)
  }
  return problems
}
