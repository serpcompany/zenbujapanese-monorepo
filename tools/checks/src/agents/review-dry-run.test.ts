import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { root } from '../files'
import { answered, called } from './code-review-cases'
import { checkoutWith } from './code-review-context-support'
import { repository, review, rulesHeading, summaryOf } from './code-review-support'
import { claudeResult } from './guards'
import { scratchFolder } from './scratch'
import { allowedTools } from './workflow'

const tool = join(root, 'tools', 'checks', 'review-dry-run.mjs')
const files = [
  {
    filename: 'src/app.ts',
    status: 'modified',
    additions: 1,
    deletions: 1,
    patch: '@@ -1 +1 @@\n-a\n+b'
  },
  {
    filename: 'docs/new.md',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+New'
  }
]
const answers = {
  'repo view': `${repository}\n`,
  'pulls/7 --jq': 'main\n',
  'contents/': 'The rules in this file.\n',
  'pulls/7/files': files,
  graphql: {
    data: {
      repository: {
        defaultBranchRef: { name: 'main' },
        pullRequest: {
          body: 'No issue: a dry run',
          baseRefName: 'main',
          closingIssuesReferences: { nodes: [] }
        }
      }
    }
  },
  'pulls/7/comments': [],
  'issues/7/comments': []
}
const standInForGh = `#!/usr/bin/env node
const { readFileSync } = require('node:fs')
const asked = process.argv.slice(2).join(' ')
const answers = JSON.parse(readFileSync(process.env.GH_ANSWERS, 'utf8'))
const found = Object.keys(answers).find(key => asked.includes(key))
if (!found) {
  console.error('no stand-in answer for: gh ' + asked)
  process.exit(1)
}
const answer = answers[found]
const text = typeof answer === 'string' ? answer : JSON.stringify(answer)
process.stdout.write(asked.includes('--include') ? 'HTTP/2.0 200 OK\\r\\n\\r\\n' + text : text)
`
const result = claudeResult({ num_turns: 9, duration_ms: 30_000, total_cost_usd: 0.3 })

function dryRun() {
  const bin = scratchFolder('stand-in-gh')
  writeFileSync(join(bin, 'gh'), standInForGh)
  chmodSync(join(bin, 'gh'), 0o755)
  writeFileSync(join(bin, 'answers.json'), JSON.stringify(answers))
  const checkout = checkoutWith(['src/app.ts', 'docs/new.md'])
  const out = scratchFolder('dry-run')
  const run = (...given: string[]) =>
    spawnSync(process.execPath, [tool, ...given], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
        GH_ANSWERS: join(bin, 'answers.json')
      }
    })
  const transcript = (name: string, messages: unknown[]) => {
    writeFileSync(join(out, name), messages.map(message => JSON.stringify(message)).join('\n'))
    return join(out, name)
  }
  return { checkout, out, run, transcript }
}

describe("a dry run of the review's reviewer", () => {
  test('builds the context and the change directory for a real pull request, and says how to run the reviewer', () => {
    const { checkout, out, run } = dryRun()
    const built = run('context', '7', checkout, out)
    expect(built.status, built.stderr).toBe(0)
    const context = readFileSync(join(out, 'review-context.md'), 'utf8')
    expect(context.startsWith(rulesHeading)).toBe(true)
    expect(context).toContain('as they are on the base branch (main)')
    expect(context).toContain('## docs/agents/code.md\n\nThe rules in this file.\n')
    expect(context).toContain(
      `whole change, as GitHub lists it, to \`${checkout}/tmp/review-change\``
    )
    expect(context).toContain('# What every review does')
    expect(readFileSync(join(out, 'review-reviewers-context.md'), 'utf8')).toBe(context)
    expect(existsSync(join(checkout, 'tmp', 'review-change', '0002.patch'))).toBe(true)
    const command = built.stdout.split('\n').find(line => line.includes('claude -p')) ?? ''
    expect(command).toContain(`cd ${checkout} && CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude -p`)
    expect(command).toContain(`"/pr-review ${repository}/pull/7"`)
    expect(command).toContain(`--append-system-prompt-file ${out}/review-context.md`)
    expect(command).toContain(
      `--append-subagent-system-prompt-file ${out}/review-reviewers-context.md`
    )
    expect(command).toContain(String(/--model \S+/.exec(String(review.with?.claude_args))))
    const dryRunTools = /--allowedTools "([^"]*)"/.exec(command)?.[1].split(',')
    expect(dryRunTools).toEqual(allowedTools(review).filter(name => !name.startsWith('mcp__')))
    expect(command).toContain(`> ${out}/attempt.jsonl`)
    expect(command).not.toContain('${{')
  })

  test("reads the workflow's own verdict from a transcript, and writes a second attempt's correction", () => {
    const { checkout, out, run, transcript } = dryRun()
    run('context', '7', checkout, out)
    const summaryFile = join(checkout, 'tmp', 'review-summary.md')
    writeFileSync(summaryFile, summaryOf('Read 1 of 2 changed files.\nNot read: the doc.').body)
    const thin = transcript('attempt.jsonl', [
      { type: 'system', subtype: 'init', cwd: checkout },
      called('app', 'Read', { file_path: join(checkout, 'tmp', 'review-change', '0001.patch') }),
      answered('app'),
      result()
    ])
    const first = run('verdict', out, thin)
    expect(first.status).toBe(0)
    expect(first.stdout).toContain('retry=true')
    expect(first.stdout).toContain(
      'problem=Incomplete: this review read 1 of 2 changed files and did not run its reviewers.'
    )
    const corrected = readFileSync(join(out, 'review-context.md'), 'utf8')
    expect(corrected).toContain('# This is the second attempt at this review')
    expect(corrected).toContain(`- "docs/new.md": ${checkout}/tmp/review-change/0002.patch`)
    expect(corrected).not.toContain('- "src/app.ts":')
    expect(readFileSync(join(out, 'review-reviewers-context.md'), 'utf8')).not.toContain(
      '# This is the second attempt'
    )
    expect(existsSync(summaryFile)).toBe(false)
    writeFileSync(summaryFile, summaryOf('Read 2 of 2 changed files.').body)
    const second = run('verdict', out, transcript('attempt-2.jsonl', [result()]), 'last')
    expect(second.status).toBe(0)
    expect(second.stdout).toContain('retry=false\nproblem=\n')
  })

  test('takes a transcript kept from CI, whose paths are the runner’s', () => {
    const { checkout, out, run, transcript } = dryRun()
    run('context', '7', checkout, out)
    const onTheRunner = '/home/runner/work/zenbujapanese-monorepo/zenbujapanese-monorepo'
    const kept = transcript('kept.json', [
      { type: 'system', subtype: 'init', cwd: onTheRunner },
      called('app', 'Read', { file_path: `${onTheRunner}/src/app.ts` }),
      answered('app'),
      called('summary', 'Write', {
        file_path: `${onTheRunner}/tmp/review-summary.md`,
        content: summaryOf('Read 1 of 2 changed files.\nNot read: the doc.').body
      }),
      answered('summary'),
      result()
    ])
    const first = run('verdict', out, kept)
    expect(first.stdout).toContain('retry=true')
    const corrected = readFileSync(join(out, 'review-context.md'), 'utf8')
    expect(corrected).toContain('the first attempt opened 1 of the 2 changed files')
    expect(corrected).not.toContain('- "src/app.ts":')
  })

  test('says how to use it when asked for anything else', () => {
    const { run } = dryRun()
    const asked = run('context', '7')
    expect(asked.status).toBe(2)
    expect(asked.stdout).toContain('review-dry-run.mjs context <pull request>')
  })
})
