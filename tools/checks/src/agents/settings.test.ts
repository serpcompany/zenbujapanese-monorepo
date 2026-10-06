import { describe, expect, test } from 'vitest'
import { allowedTools, claudeSteps, readRepositoryFile, workflowFiles } from './workflow'

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
  test('asks before every package script that deploys or reaches a remote service', () => {
    expect(remoteScripts.map(script => script.name)).toEqual(
      expect.arrayContaining(['deploy:staging', 'deploy:production'])
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
    'gh api -XPUT repos/serpcompany/zenbujapanese-monorepo/environments/production',
    'gh api --method PATCH repos/serpcompany/zenbujapanese-monorepo/environments/staging -f wait_timer=0',
    'gh api graphql -f query="mutation { mergePullRequest(input: {pullRequestId: \\"x\\"}) { clientMutationId } }"',
    'gh api repos/serpcompany/zenbujapanese-monorepo/rulesets --input ruleset.json',
    'gh api --method POST orgs/serpcompany/rulesets --input ruleset.json',
    'gh api --method PUT repos/serpcompany/zenbujapanese-monorepo/branches/main/protection --input protection.json',
    'gh api repos/serpcompany/zenbujapanese-monorepo/actions/secrets/CLAUDE_CODE_OAUTH_TOKEN -X PUT -f encrypted_value=x',
    'gh api repos/serpcompany/zenbujapanese-monorepo/actions/variables -f name=DEPLOY_PRODUCTION -f value=true',
    'gh api -X PUT repos/serpcompany/zenbujapanese-monorepo/pulls/7/merge',
    'gh api repos/serpcompany/zenbujapanese-monorepo/hooks -f url=https://example.com/hook',
    'gh api --method PUT repos/serpcompany/zenbujapanese-monorepo/collaborators/someone',
    'gh api repos/serpcompany/zenbujapanese-monorepo/keys -f key="ssh-ed25519 AAAA"',
    'gh api --method DELETE repos/serpcompany/zenbujapanese-monorepo/issues/comments/99',
    'gh api --method=DELETE repos/serpcompany/zenbujapanese-monorepo/git/refs/heads/feature',
    'gh api -X DELETE repos/serpcompany/zenbujapanese-monorepo/labels/bug',
    'gh api -XDELETE repos/serpcompany/zenbujapanese-monorepo/releases/1',
    'gh api --method=PUT repos/serpcompany/zenbujapanese-monorepo/topics -f names[]=japanese',
    'gh repo edit serpcompany/zenbujapanese-monorepo --enable-auto-merge',
    'gh api repos/serpcompany/zenbujapanese-monorepo/actions/workflows/web-deploy.yml/dispatches -f ref=main',
    'gh api -X POST repos/serpcompany/zenbujapanese-monorepo/actions/runs/1/rerun',
    'gh api -X POST repos/serpcompany/zenbujapanese-monorepo/actions/runs/1/cancel',
    'gh api -X PATCH repos/serpcompany/zenbujapanese-monorepo/git/refs/heads/main -F force=true -f sha=abc',
    'gh api repos/serpcompany/zenbujapanese-monorepo/merges -f base=main -f head=feature',
    'gh api repos/serpcompany/zenbujapanese-monorepo/releases -f tag_name=v1',
    'gh api repos/serpcompany/zenbujapanese-monorepo/transfer -f new_owner=someone',
    'gh api --method PATCH repos/serpcompany/zenbujapanese-monorepo/git/refs/heads/x -F force=true -f n=/issues/comments/1 -F body=@tmp/review-summary.md',
    'gh repo delete serpcompany/zenbujapanese-monorepo --yes',
    'gh api --method PATCH repos/serpcompany/zenbujapanese-monorepo -f default_branch=staging',
    'gh api -X PATCH repos/serpcompany/zenbujapanese-monorepo -F private=true',
    'gh api --method=PATCH repos/serpcompany/zenbujapanese-monorepo -F allow_auto_merge=true',
    'gh api --method PATCH repos/serpcompany/zenbujapanese-monorepo --input settings.json',
    'npx wrangler@4 deploy --env production',
    'npx wrangler@4.143.0 secret put DICTIONARY_API_TOKEN',
    'npx @opennextjs/cloudflare@1 deploy',
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
    'pnpm cf-typegen',
    'docker build -t zenbujapanese-dictionary-api .',
    'gh pr view 7 --comments',
    'gh api repos/serpcompany/zenbujapanese-monorepo/pulls/7/comments',
    'gh api repos/serpcompany/zenbujapanese-monorepo/actions/runs --jq ".workflow_runs[0].status"',
    'gh api repos/actions/checkout/contents/action.yml?ref=v5 --jq .content',
    'gh api repos/serpcompany/zenbujapanese-monorepo/issues/7/comments',
    'gh api --method PATCH repos/serpcompany/zenbujapanese-monorepo/issues/comments/99 -F body=@tmp/review-summary.md',
    'gh pr comment 7 --repo serpcompany/zenbujapanese-monorepo --body-file tmp/review-summary.md',
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
  const jobs = workflowFiles().flatMap(path =>
    claudeSteps(path).map(step => ({ path, tools: allowedTools(step) }))
  )
  const readOnlyToolsNeedingNoAllowRule = ['Read', 'Glob', 'Grep']
  const tools = [
    ...new Set([...jobs.flatMap(job => job.tools), ...readOnlyToolsNeedingNoAllowRule])
  ]

  test('are found in every workflow that runs Claude', () => {
    expect(jobs.map(job => job.path)).toEqual([
      '.github/workflows/claude.yml',
      '.github/workflows/code-review.yml',
      '.github/workflows/maintenance.yml',
      '.github/workflows/maintenance.yml'
    ])
    expect(tools).toEqual(
      expect.arrayContaining([
        'Task',
        'Bash(git:*)',
        'Bash(pnpm check)',
        'Bash(gh api --method PATCH repos/*/issues/comments/* -F body=@tmp/review-summary.md)'
      ])
    )
  })

  test('are neither denied nor asked about a tool they use', () => {
    const blocked = tools.filter(tool => {
      const rule = parseRule(tool)
      if (rule.pattern === null) {
        return [...denyRules, ...askRules].some(other => other.tool === rule.tool)
      }
      return decision(rule.tool, rule.pattern.replace(/(?::| )\*$/, '')) !== 'default'
    })
    expect(blocked).toEqual([])
  })

  test.each([
    'git add apps/web/src/lib/log.ts',
    'git commit -m "Split the website guide by task (#516)"',
    'git push origin fl/feature',
    'git push origin claude/issue-12-20261005-1400',
    'git push -u origin docs/gardening-2026-10-05',
    'git push -u origin chore/code-gardening-2026-10-05',
    'gh pr create --base main --title "Weekly doc gardening (2026-10-05)" --body-file tmp/pr-body.md',
    'pnpm -s verify docs',
    'pnpm verify',
    'pnpm verify comments apps/web',
    'pnpm check',
    'pnpm --filter zenbujapanese-web check'
  ])('let a CI job run %s', command => {
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
