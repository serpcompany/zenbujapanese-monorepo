import { expect, test } from 'vitest'
import type { Duplicate } from './duplicates'
import { duplicateProblems } from './known-duplicates'

const clone = (first: string, second: string, start = 1): Duplicate => ({
  first: { name: first, start, end: start + 9 },
  second: { name: second, start: start + 20, end: start + 29 },
  lines: 10
})

const known = { 'a.py and b.py': { blocks: 2, reason: 'a test' } }

test('names a repeated block no list excepts', () => {
  expect(duplicateProblems([clone('c.ts', 'd.ts')], ['c.ts', 'd.ts'], known)).toEqual([
    'c.ts:1-10  repeats d.ts:21-30 (10 lines)'
  ])
})

test('passes a known pair that repeats no more than it did, in either order', () => {
  expect(
    duplicateProblems([clone('b.py', 'a.py'), clone('a.py', 'b.py', 40)], ['a.py', 'b.py'], known)
  ).toEqual([])
})

test('names a known pair that repeats more', () => {
  const found = [clone('a.py', 'b.py'), clone('a.py', 'b.py', 40), clone('a.py', 'b.py', 80)]
  expect(duplicateProblems(found, ['a.py', 'b.py'], known).at(-1)).toBe(
    'a.py and b.py  repeat 3 blocks, more than the 2 knownDuplicates allows'
  )
})

test('asks to lower the count as blocks are shared, and to drop the pair at none', () => {
  expect(duplicateProblems([clone('a.py', 'b.py')], ['a.py', 'b.py'], known)).toEqual([
    'a.py and b.py  repeat 1 blocks now: lower knownDuplicates to 1'
  ])
  expect(duplicateProblems([], ['a.py', 'b.py'], known)).toEqual([
    'a.py and b.py  no longer repeat each other: remove them from knownDuplicates'
  ])
})

test('leaves a known pair alone when a run checks other files', () => {
  expect(duplicateProblems([], ['c.ts'], known)).toEqual([])
})

test('refuses an exception without a reason', () => {
  expect(
    duplicateProblems([clone('a.py', 'b.py')], ['a.py', 'b.py'], {
      'a.py and b.py': { blocks: 1, reason: ' ' }
    })
  ).toEqual(['a.py and b.py  are excepted without a reason'])
})
