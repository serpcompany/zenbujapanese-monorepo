import { describe, expect, test } from 'vitest'
import { isReadableLength, isUnreadableQuery } from './dictionary'

test('a query or form is readable up to 200 code points', () => {
  expect(isReadableLength('a'.repeat(200))).toBe(true)
  expect(isReadableLength('a'.repeat(201))).toBe(false)
})

test('a character outside the BMP counts once, in code points', () => {
  expect(isReadableLength(String.fromCodePoint(0x20000).repeat(200))).toBe(true)
})

describe('isUnreadableQuery', () => {
  test.each([
    'malformed MATCH expression: [eat"]',
    'unterminated string'
  ])('reads "%s" as a query full-text search cannot read', message => {
    expect(isUnreadableQuery(new Error(message))).toBe(true)
    expect(isUnreadableQuery(new Error('search failed', { cause: new Error(message) }))).toBe(true)
  })

  test.each([
    'no such table: entries',
    'database is locked',
    'near "SELEC": syntax error'
  ])('reads "%s" as a failure, so a SQL bug fails loudly rather than finding nothing', message => {
    expect(isUnreadableQuery(new Error(message))).toBe(false)
  })
})
