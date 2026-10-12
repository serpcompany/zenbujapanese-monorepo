import { describe, expect, test } from 'vitest'
import { areaOf, groupFindings, isRepeated, readFindings, titleOf } from './review-findings'

const finding = (path: string, pull: number, body = '**blocking** The token is logged.') => ({
  path,
  body,
  url: `https://github.com/o/r/pull/${pull}#discussion_r${pull}${path.length}`,
  pull
})

describe('review findings', () => {
  test('are grouped by the part of the repository their file is in', () => {
    expect(areaOf('apps/web/src/lib/site.ts')).toBe('apps/web')
    expect(areaOf('packages/dictionary-core/src/search/english.ts')).toBe(
      'packages/dictionary-core'
    )
    expect(areaOf('docs/agents/web.md')).toBe('docs/agents')
    expect(areaOf('docs/quality.md')).toBe('docs/quality')
    expect(areaOf('.github/workflows/web.yml')).toBe('.github/workflows')
    expect(areaOf('deploy/deployer.sh')).toBe('deploy')
    expect(areaOf('AGENTS.md')).toBe('AGENTS.md')
  })

  test('are titled by their first line, without the marks around it', () => {
    expect(titleOf('**blocking** **The token is logged.**\n\nIt reaches Workers Logs.')).toBe(
      'The token is logged.'
    )
    expect(titleOf('\n**suggestion**: name [the helper] for what it does')).toBe(
      'name the helper for what it does'
    )
    expect(titleOf(`**${'x'.repeat(200)}**`)).toHaveLength(100)
  })

  test('count pull requests and blocking findings in each area, the most widespread first', () => {
    const groups = groupFindings([
      finding('apps/web/src/a.ts', 7),
      finding('apps/web/src/b.ts', 7, '**suggestion** Name it for what it does.'),
      finding('apps/web/worker.ts', 9),
      finding('apps/ios/App/Info.plist', 9),
      finding('tools/checks/src/cli.ts', 12, 'Blocking: exits 0 on a failure.')
    ])
    expect(
      groups.map(({ area, findings, pulls, blocking }) => [area, findings, pulls, blocking])
    ).toEqual([
      ['apps/web', 3, 2, 2],
      ['apps/ios', 1, 1, 1],
      ['tools/checks', 1, 1, 1]
    ])
    expect(groups[0].examples).toEqual([
      { title: 'The token is logged.', url: 'https://github.com/o/r/pull/7#discussion_r717' },
      { title: 'Name it for what it does.', url: 'https://github.com/o/r/pull/7#discussion_r717' },
      { title: 'The token is logged.', url: 'https://github.com/o/r/pull/9#discussion_r918' }
    ])
    expect(groups.map(isRepeated)).toEqual([true, false, false])
  })

  test('three findings in one pull request are not a pattern yet', () => {
    const [group] = groupFindings([1, 2, 3].map(() => finding('apps/web/src/a.ts', 7)))
    expect(isRepeated(group)).toBe(false)
  })

  test('are read only when they have the shape the report needs', () => {
    expect(readFindings({ message: 'Not Found' })).toEqual([])
    expect(
      readFindings([
        finding('a.ts', 1),
        { path: 'b.ts' },
        null,
        { ...finding('c.ts', 2), pull: '2' }
      ])
    ).toEqual([finding('a.ts', 1)])
  })
})
