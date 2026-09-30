import { describe, expect, test } from 'vitest'
import { ftsPhrase, ftsPrefix } from './fts'

// The app's match strings (LookupClient.swift), which FTS4 reads directly.
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
