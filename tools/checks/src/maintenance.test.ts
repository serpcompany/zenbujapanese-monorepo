import { describe, expect, test } from 'vitest'
import { docsToReverify, lastChangeTimes, problemsShownPerCheck, renderReport } from './maintenance'

const log = [
  '',
  '300\n\ndocs/agents/web.md\napps/web/src/lib/dictionary/api.ts\n',
  '200\n\napps/web/scripts/smoke.sh\n',
  '100\n\ndocs/agents/web.md\napps/web/scripts/smoke.sh\napps/web/src/lib/log.ts\n'
].join('\0')

describe('lastChangeTimes', () => {
  test("takes each file's newest commit from git log, newest first", () => {
    expect(Object.fromEntries(lastChangeTimes(log))).toEqual({
      'docs/agents/web.md': 300,
      'apps/web/src/lib/dictionary/api.ts': 300,
      'apps/web/scripts/smoke.sh': 200,
      'apps/web/src/lib/log.ts': 100
    })
  })
})

describe('docsToReverify', () => {
  const times = new Map([
    ['docs/agents/web.md', 150],
    ['docs/agents/ci.md', 400],
    ['apps/web/scripts/smoke.sh', 200],
    ['apps/web/src/lib/log.ts', 100]
  ])

  test('lists the files a doc names that changed after it did', () => {
    expect(
      docsToReverify(
        [
          {
            doc: 'docs/agents/web.md',
            references: ['apps/web/scripts/smoke.sh', 'apps/web/src/lib/log.ts']
          },
          { doc: 'docs/agents/ci.md', references: ['apps/web/scripts/smoke.sh'] }
        ],
        times
      )
    ).toEqual([{ doc: 'docs/agents/web.md', changed: ['apps/web/scripts/smoke.sh'] }])
  })

  test('skips a doc with no history yet', () => {
    expect(
      docsToReverify([{ doc: 'docs/new.md', references: ['apps/web/scripts/smoke.sh'] }], times)
    ).toEqual([])
  })
})

describe('renderReport', () => {
  const facts = {
    date: '2026-10-05',
    checks: [
      { name: 'comments', problems: [] },
      { name: 'docs', problems: ['docs/agents/ci.md:16  links to gone.yml, which doesn’t exist'] }
    ],
    staleDocs: [{ doc: 'docs/agents/web.md', changed: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    debtRows: 27,
    sizeExceptions: [{ path: 'apps/ios/SearchView.swift', lines: 1101 }],
    nearLimit: [{ path: 'packages/dictionary-core/src/search/english.ts', lines: 471 }],
    qualityChanged: '2026-09-30',
    codeCommitsSinceQuality: 5
  }

  test('shows a failing check with what it found, and caps each doc at five files', () => {
    const report = renderReport(facts)
    expect(report).toContain('`pnpm verify docs` fails:')
    expect(report).toContain('links to gone.yml')
    expect(report).toContain('- `docs/agents/web.md`: `a`, `b`, `c`, `d`, `e`, +2 more')
    expect(report).toContain('27 open items')
    expect(report).toContain('`apps/ios/SearchView.swift`: 1101 lines')
    expect(report).toContain('5 commits have changed code since')
    expect(report).toContain('1 code files have 450 lines or more')
    expect(report).toContain('- `packages/dictionary-core/src/search/english.ts`: 471 lines')
  })

  test('caps a check that fails many times, so the issue stays under GitHub’s size limit', () => {
    const problems = Array.from(
      { length: 3000 },
      (_, index) => `docs/a.md:${index}  ${'x'.repeat(60)}`
    )
    const report = renderReport({ ...facts, checks: [{ name: 'docs', problems }] })
    expect(report).toContain(`docs/a.md:${problemsShownPerCheck - 1} `)
    expect(report).not.toContain(`docs/a.md:${problemsShownPerCheck} `)
    expect(report).toContain(`${3000 - problemsShownPerCheck} more: run \`pnpm verify docs\``)
    expect(report.length).toBeLessThan(65_536)
  })

  test('says when every check passes and no doc needs re-verifying', () => {
    const report = renderReport({
      ...facts,
      checks: [{ name: 'comments', problems: [] }],
      staleDocs: []
    })
    expect(report).toContain('Passing: comments.')
    expect(report).toContain('## Docs to re-verify\n\nFiles')
    expect(report).toMatch(/Check that each doc still matches them\.\n\nNone\./)
  })
})
