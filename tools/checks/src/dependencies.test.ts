import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { checkDependencies, type Part, reachableFrom } from './dependencies'
import { root } from './files'

mkdirSync(join(root, 'tmp'), { recursive: true })
const folder = mkdtempSync(join(root, 'tmp', 'dependencies-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

function files(contents: Record<string, string>): string {
  const part = mkdtempSync(join(folder, 'part-'))
  const all = { 'tsconfig.json': '{ "compilerOptions": { "strict": true } }', ...contents }
  for (const [name, content] of Object.entries(all)) {
    mkdirSync(dirname(join(part, name)), { recursive: true })
    writeFileSync(join(part, name), content)
  }
  return relative(root, part)
}

const testCode = '\\.test\\.ts$'

function check(contents: Record<string, string>) {
  const part: Part = {
    folder: files(contents),
    sources: ['src'],
    testCode,
    rules: [reachableFrom(['^src/entry\\.ts$'], testCode)]
  }
  return checkDependencies(part).then(report => report.join('\n'))
}

test('passes modules that import one way and are all used', async () => {
  expect(
    await check({
      'src/entry.ts': "import { label } from './label'\nexport const page = label('home')\n",
      'src/label.ts': 'export const label = (name: string) => name.toUpperCase()\n',
      'src/label.test.ts': "import { label } from './label'\nlabel('a')\n"
    })
  ).toBe('')
})

test('names modules that import each other', async () => {
  const report = await check({
    'src/entry.ts': "import { first } from './first'\nexport const value = first()\n",
    'src/first.ts': "import { second } from './second'\nexport const first = () => second() + 1\n",
    'src/second.ts':
      "import type { first } from './first'\nexport const second = (): ReturnType<typeof first> => 1\n"
  })
  expect(report).toMatch(/no-circular: src\/first\.ts →\s+src\/second\.ts →\s+src\/first\.ts/)
})

test('names a module nothing runs', async () => {
  const report = await check({
    'src/entry.ts': 'export const page = 1\n',
    'src/forgotten.ts': 'export const forgotten = 2\n'
  })
  expect(report).toMatch(/every-module-is-used: src\/forgotten\.ts/)
})

test('names production code that imports a test', async () => {
  const report = await check({
    'src/entry.ts': "import { sample } from './entry.test'\nexport const page = sample\n",
    'src/entry.test.ts': 'export const sample = 1\n'
  })
  expect(report).toMatch(/production-imports-no-test: src\/entry\.ts → src\/entry\.test\.ts/)
})
