import { expect, test } from 'vitest'
import { codePaths, markdownLinks, referencedFiles, treeOf } from './doc-references'

const roots = ['apps', 'tools', '.github']

test('finds inline and reference links, but not ones in code', () => {
  const text = [
    'See [the guide](docs/guide.md#run) and [a site](https://example.com).',
    '[ref]: ../other.md',
    'Not `[this](inline.md)`.',
    '```',
    '[nor this](fenced.md)',
    '```'
  ].join('\n')
  expect(markdownLinks(text)).toEqual([
    { target: 'docs/guide.md#run', line: 1 },
    { target: 'https://example.com', line: 1 },
    { target: '../other.md', line: 2 }
  ])
})

test('finds repository paths in code spans, skipping patterns and placeholders', () => {
  const text = [
    'Run `apps/web/scripts/smoke.sh`, then `pnpm check`.',
    'Not `apps/web/src/**/*.ts`, `apps/<surface>/`, or `/etc/hosts`.',
    'But `./tools/checks/src/report.ts:` is one, and `.github/workflows/web.yml@refs/heads/main` names a file.'
  ].join('\n')
  expect(codePaths(text, roots)).toEqual([
    { target: 'apps/web/scripts/smoke.sh', line: 1 },
    { target: 'tools/checks/src/report.ts', line: 3 },
    { target: '.github/workflows/web.yml', line: 3 }
  ])
})

test('reads a path with a line number as the path', () => {
  expect(codePaths('See `apps/web/worker.ts:12` and `tools/checks/ports.mjs:4-9`.', roots)).toEqual(
    [
      { target: 'apps/web/worker.ts', line: 1 },
      { target: 'tools/checks/ports.mjs', line: 1 }
    ]
  )
})

test("lists the files a doc links or names, from the root or the doc's folder, and no docs", () => {
  const tree = treeOf([
    'docs/agents/web.md',
    'docs/agents/ci.md',
    'apps/web/worker.ts',
    'apps/web/scripts/smoke.sh',
    'docs/agents/notes.txt'
  ])
  const text = [
    'Run `apps/web/scripts/smoke.sh`, read [the worker](../../apps/web/worker.ts) and',
    '[the CI guide](ci.md), keep [notes](notes.txt), and skip [a site](https://example.com).',
    'Not `apps/web/missing.ts`.'
  ].join('\n')
  expect(referencedFiles('docs/agents/web.md', text, tree, roots)).toEqual([
    'apps/web/scripts/smoke.sh',
    'apps/web/worker.ts',
    'docs/agents/notes.txt'
  ])
  expect(referencedFiles('docs/adr/0001-a-record.md', text, tree, roots)).toEqual([])
})
