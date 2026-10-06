import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { describeDuplicate, findDuplicates } from './duplicates'
import { root } from './files'

mkdirSync(join(root, 'tmp'), { recursive: true })
const folder = mkdtempSync(join(root, 'tmp', 'duplicates-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

function file(name: string, content: string): string {
  writeFileSync(join(folder, name), content)
  return relative(root, join(folder, name))
}

const repeated = (
  name: string
) => `export function ${name}(rows: { id: number; title: string; reading: string }[]) {
  const seen = new Set<number>()
  const kept: { id: number; title: string; reading: string }[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    kept.push({ ...row, title: row.title.trim(), reading: row.reading.normalize('NFKC') })
  }
  return kept.sort((left, right) => left.title.localeCompare(right.title) || left.id - right.id)
}
`

test('finds a block repeated across files and names both places', () => {
  const first = file('first.ts', repeated('uniqueWords'))
  const second = file('second.ts', `export const site = 'zenbu'\n\n${repeated('uniqueKanji')}`)
  const found = findDuplicates([first, second])
  expect(found).toHaveLength(1)
  expect(describeDuplicate(found[0])).toMatch(
    new RegExp(`^${first}:\\d+-\\d+  repeats ${second}:\\d+-\\d+ \\(\\d+ lines\\)$`)
  )
})

test('passes code that says each thing once', () => {
  const only = file('only.ts', repeated('uniqueRows'))
  const other = file('other.ts', 'export const greeting = (name: string) => `Hello, ${name}`\n')
  expect(findDuplicates([only, other])).toEqual([])
})

test('ignores files that are not code', () => {
  const notes = file('notes.md', `${repeated('a')}\n${repeated('b')}`)
  expect(findDuplicates([notes])).toEqual([])
})
