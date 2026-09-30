import { expect, test } from 'vitest'
import { checkSizes } from './sizes'

const small = 'tools/checks/src/text.ts'

test('passes a file under the limit that no list names', () => {
  expect(checkSizes([small], {})).toEqual([])
})

test('asks to drop a listed file once it is under the limit', () => {
  expect(checkSizes([small], { [small]: { lines: 900, reason: 'a test' } })).toEqual([
    { path: small, problem: expect.stringMatching(/remove it from knownLargeFiles/) }
  ])
})

test('asks to drop a listed file that no longer exists', () => {
  expect(checkSizes([], { 'gone.ts': { lines: 900, reason: 'a test' } })).toEqual([
    { path: 'gone.ts', problem: 'no longer exists: remove it from knownLargeFiles' }
  ])
})

test('refuses an exception without a reason', () => {
  const large = 'apps/ios/Modules/Sources/SearchExperience/SearchView.swift'
  expect(checkSizes([large], { [large]: { lines: 5000, reason: ' ' } })).toEqual([
    { path: large, problem: 'is excepted from the limit without a reason' }
  ])
})
