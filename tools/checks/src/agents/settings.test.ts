import { describe, expect, test } from 'vitest'
import { allowedTools, claudeStep, readRepositoryFile, workflowSteps } from './workflow'

interface Rule {
  tool: string
  pattern: string | null
}

const settings = JSON.parse(readRepositoryFile('.claude/settings.json')) as {
  permissions: { deny: string[]; ask: string[] }
}
const mcpServers = (
  JSON.parse(readRepositoryFile('.mcp.json')) as {
    mcpServers: Record<string, { command: string; args: string[] }>
  }
).mcpServers

function parseRule(rule: string): Rule {
  const match = /^([\w-]+)(?:\((.*)\))?$/.exec(rule)
  if (!match) throw new Error(`Unexpected permission rule: ${rule}`)
  return { tool: match[1], pattern: match[2] ?? null }
}

const denyRules = settings.permissions.deny.map(parseRule)
const askRules = settings.permissions.ask.map(parseRule)
const shells = ['Bash', 'PowerShell']

function ruleMatches(rule: Rule, tool: string, command: string): boolean {
  if (rule.tool !== tool) return false
  if (rule.pattern === null) return true
  const pattern = rule.pattern.endsWith(':*') ? `${rule.pattern.slice(0, -2)} *` : rule.pattern
  const flags = tool === 'PowerShell' ? 'i' : ''
  const source = pattern
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  if (new RegExp(`^${source}$`, flags).test(command)) return true
  const bare = pattern.slice(0, -2)
  return (
    pattern.endsWith(' *') &&
    !bare.includes('*') &&
    new RegExp(`^${source.slice(0, -3)}$`, flags).test(command)
  )
}

const withoutAssignments = (command: string) =>
  command.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '')

function decision(tool: string, command: string): 'deny' | 'ask' | 'default' {
  const commands = [command, withoutAssignments(command)]
  const matches = (rules: Rule[]) =>
    rules.some(rule => commands.some(text => ruleMatches(rule, tool, text)))
  if (matches(denyRules)) return 'deny'
  if (matches(askRules)) return 'ask'
  return 'default'
}

const workspacePackages = [
  'package.json',
  'apps/web/package.json',
  'apps/dictionary-api/package.json',
  'packages/dictionary-core/package.json',
  'tools/checks/package.json'
]
const remoteCommand =
  /--remote\b|wrangler (?:deploy|secret|versions|rollback|delete)\b|opennextjs-cloudflare (?:deploy|upload)\b/
const remoteScripts = workspacePackages.flatMap(path => {
  const manifest = JSON.parse(readRepositoryFile(path)) as {
    name: string
    scripts?: Record<string, string>
  }
  return Object.entries(manifest.scripts ?? {})
    .filter(
      ([name, command]) => remoteCommand.test(command) || /:(?:staging|production)\b/.test(name)
    )
    .map(([name]) => ({ name, workspace: manifest.name }))
})

describe('.claude/settings.json', () => {
  test('asks before every package script that deploys or reaches a remote database', () => {
    expect(remoteScripts.map(script => script.name)).toEqual(
      expect.arrayContaining(['deploy:staging', 'deploy:production', 'db:migrate:production'])
    )
    const unasked = remoteScripts.flatMap(({ name, workspace }) =>
      shells.flatMap(shell =>
        [`pnpm ${name}`, `pnpm run ${name}`, `pnpm --filter ${workspace} ${name}`]
          .filter(command => decision(shell, command) !== 'ask')
          .map(command => `${shell}: ${command}`)
      )
    )
    expect(unasked).toEqual([])
  })

  test.each([
    'pnpm exec wrangler d1 migrations apply zenbujapanese-web-production --remote --env production',
    'npx wrangler deploy --env production',
    'wrangler versions deploy',
    'pnpm wrangler versions upload',
    'pnpm exec wrangler rollback',
    'npx wrangler delete',
    'pnpm exec wrangler secret put DICTIONARY_API_TOKEN --env production',
    'CLOUDFLARE_ACCOUNT_ID=abc123 npx wrangler d1 execute DB --remote --command "SELECT 1"',
    'pnpm exec opennextjs-cloudflare deploy --env staging',
    'npx opennextjs-cloudflare upload',
    'docker push ghcr.io/serpcompany/zenbujapanese-dictionary-api:staging',
    'docker buildx imagetools create --prefer-index=false -t a:production a:staging',
    'gh workflow run dictionary-api-deploy.yml',
    'gh run rerun 123',
    'gh pr merge 7 --merge',
    'gh secret set CLAUDE_CODE_OAUTH_TOKEN',
    'gh variable set DEPLOY_PRODUCTION --body false',
    'gh api repos/serpcompany/zenbujapanese-monorepo/issues/1/sub_issues --method POST -F sub_issue_id=2',
    'python language-data/pipeline/publish.py publish out',
    'python3 language-data/pipeline/publish.py verify --hash all'
  ])('asks before %s', command => {
    for (const shell of shells) expect(decision(shell, command), shell).toBe('ask')
  })

  test.each([
    'gh pr comment 7 --body "Run pnpm exec wrangler deploy --env staging after this merges"',
    'gh pr comment 7 --body "This adds a wrangler secret put step"',
    'grep -rn "opennextjs-cloudflare deploy" apps/web',
    'git commit -m "Explain docker push in the deploy guide"'
  ])('lets %s through, which only mentions such a command', command => {
    for (const shell of shells) expect(decision(shell, command), shell).toBe('default')
  })

  test.each([
    'pnpm check',
    'pnpm verify',
    'pnpm dev',
    'pnpm preview',
    'pnpm db:migrate:local',
    'pnpm exec wrangler d1 migrations list zenbujapanese-web-local --local',
    'docker build -t zenbujapanese-dictionary-api .',
    'gh pr view 7 --comments',
    'gh api repos/serpcompany/zenbujapanese-monorepo/pulls/7/comments',
    'git push -u origin chore/agent-harness'
  ])('runs %s without asking', command => {
    for (const shell of shells) expect(decision(shell, command), shell).toBe('default')
  })

  test('denies reaching the server by SSH', () => {
    for (const shell of shells) {
      for (const command of ['ssh daftadmin@example.com', 'scp a b:', 'rsync -a a b:']) {
        expect(decision(shell, command), `${shell}: ${command}`).toBe('deny')
      }
    }
  })

  test('starts no rule with a wildcard, which would match inside other commands', () => {
    expect([...denyRules, ...askRules].filter(rule => rule.pattern?.startsWith('*'))).toEqual([])
  })

  test('gives every Bash rule a PowerShell twin', () => {
    for (const rules of [denyRules, askRules]) {
      const patterns = (tool: string) =>
        rules.filter(rule => rule.tool === tool).map(rule => rule.pattern)
      expect(patterns('PowerShell')).toEqual(patterns('Bash'))
    }
  })
})

describe('the CI Claude jobs under .claude/settings.json', () => {
  const reviewTools = allowedTools(
    claudeStep(workflowSteps('.github/workflows/code-review.yml')).step
  )
  const gardeningTools = allowedTools(
    claudeStep(workflowSteps('.github/workflows/maintenance.yml', 'doc-gardening')).step
  )

  test('are neither denied nor asked about a tool they use', () => {
    expect(reviewTools).toContain('Task')
    expect(gardeningTools).toContain('Bash(git:*)')
    const blocked = [...new Set([...reviewTools, ...gardeningTools])].filter(tool => {
      const rule = parseRule(tool)
      if (rule.pattern === null) {
        return [...denyRules, ...askRules].some(other => other.tool === rule.tool)
      }
      return decision(rule.tool, rule.pattern.replace(/(?::| )\*$/, '')) !== 'default'
    })
    expect(blocked).toEqual([])
  })

  test.each([
    'git push -u origin docs/gardening-2026-10-05',
    'gh pr create --base main --title "Weekly doc gardening (2026-10-05)"',
    'pnpm -s verify docs'
  ])('let doc gardening run %s', command => {
    expect(decision('Bash', command)).toBe('default')
  })
})

describe('.mcp.json', () => {
  test('pins every npx server to an exact version', () => {
    for (const [name, server] of Object.entries(mcpServers)) {
      if (server.command !== 'npx') continue
      const spec = server.args.find(arg => !arg.startsWith('-'))
      expect(spec, name).toMatch(/^(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/)
    }
  })

  test('gives Chrome a temporary profile, and verify-web the same server without a display', () => {
    const chrome = mcpServers['chrome-devtools']
    expect(chrome.args).toContain('--isolated')
    const skill = readRepositoryFile('.claude/skills/verify-web/SKILL.md')
    const override = /claude mcp add chrome-devtools --scope local -- ([^`\n]+)/
      .exec(skill)?.[1]
      .trim()
      .split(/\s+/)
    expect(override?.[0]).toBe(chrome.command)
    expect(override?.slice(1).sort()).toEqual([...chrome.args, '--headless'].sort())
  })
})
