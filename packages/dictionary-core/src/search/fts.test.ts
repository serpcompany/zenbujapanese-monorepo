import { describe, expect, test } from 'vitest'
import { ftsPhrase, ftsPrefix, isUnreadableQuery } from './fts'

describe('ftsPhrase', () => {
  test('quotes the value', () => {
    expect(ftsPhrase('eat')).toBe('"eat"')
    expect(ftsPhrase('to eat')).toBe('"to eat"')
  })

  test('doubles each inner quote', () => {
    expect(ftsPhrase('a"b')).toBe('"a""b"')
    expect(ftsPhrase('"')).toBe('""""')
  })
})

describe('ftsPrefix', () => {
  test('makes one run of letters or numbers a prefix query', () => {
    expect(ftsPrefix('tabe')).toBe('tabe*')
    expect(ftsPrefix('ta2')).toBe('ta2*')
    expect(ftsPrefix('café')).toBe('café*')
  })

  test('leaves anything else a phrase', () => {
    expect(ftsPrefix('to eat')).toBe('"to eat"')
    expect(ftsPrefix("don't")).toBe('"don\'t"')
    expect(ftsPrefix('')).toBe('""')
  })
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
