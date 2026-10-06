import { expect, test } from 'vitest'
import { codePaths, markdownLinks } from './docs'

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
    'But `./tools/checks/src/cli.ts:` is one, and `.github/workflows/web.yml@refs/heads/main` names a file.'
  ].join('\n')
  expect(codePaths(text)).toEqual([
    { target: 'apps/web/scripts/smoke.sh', line: 1 },
    { target: 'tools/checks/src/cli.ts', line: 3 },
    { target: '.github/workflows/web.yml', line: 3 }
  ])
})

test('reads a path with a line number as the path', () => {
  expect(codePaths('See `apps/web/worker.ts:12` and `tools/checks/src/cli.ts:4-9`.')).toEqual([
    { target: 'apps/web/worker.ts', line: 1 },
    { target: 'tools/checks/src/cli.ts', line: 1 }
  ])
})
