import { describe, expect, test } from 'vitest'
import { fts4Phrase, fts4Prefix, fts5Phrase } from './fts'

// Each FTS5 query here matches the rows the app's FTS4 query matches.
describe('fts4Phrase', () => {
  test('keeps a plain phrase', () => {
    expect(fts4Phrase('eat')).toBe('"eat"')
    expect(fts4Phrase('to eat')).toBe('"to eat"')
  })

  test('turns a star after a word into a prefix, even mid-phrase', () => {
    expect(fts4Phrase('eat*')).toBe('"eat"*')
    expect(fts4Phrase('to ea*')).toBe('"to ea"*')
    expect(fts4Phrase('ta*be')).toBe('"ta"* + "be"')
    expect(fts4Phrase('eat***')).toBe('"eat"*')
  })

  test('requires every phrase a quote separates', () => {
    expect(fts4Phrase('a"b')).toBe('"a" "b"')
  })

  test('matches nothing when a phrase has no words', () => {
    expect(fts4Phrase('"taberu"')).toBeNull()
    expect(fts4Phrase('o"')).toBeNull()
    expect(fts4Phrase('*')).toBeNull()
    expect(fts4Phrase('')).toBeNull()
  })
})

describe('fts4Prefix', () => {
  test('prefixes a single word and treats anything else as a phrase', () => {
    expect(fts4Prefix('tabe')).toBe('tabe*')
    expect(fts4Prefix('tabe*')).toBe('"tabe"*')
    expect(fts4Prefix('ta be')).toBe('"ta be"')
  })
})

describe('fts5Phrase', () => {
  test('escapes quotes the FTS5 way', () => {
    expect(fts5Phrase('a"b')).toBe('"a""b"')
  })
})
