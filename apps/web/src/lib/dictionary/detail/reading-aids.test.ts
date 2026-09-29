import { describe, expect, test } from 'vitest'
import { readingWithoutFurigana, shortMeaning, wordMeaning } from './reading-aids'

// Expected values follow DictionaryEntry.shortMeaning(from:) and ReadingAidPresentation.swift. The
// word-detail suite checks both against the app for every recorded example word.

describe('shortMeaning (DictionaryEntry.shortMeaning)', () => {
  test.each([
    ['to see, to look, to watch', 'see'],
    ['clothes (esp. Western clothes), dress', 'clothes'],
    ['middle of the night, dead of night', 'middle of the nig…'],
    ['to be (of animate objects), to exist', 'be'],
    [', odd, leading comma', 'odd'],
    ['(only notes)', null],
    [null, null]
  ])('%s gives %s', (meaning, short) => {
    expect(shortMeaning(meaning)).toBe(short)
  })

  test('a function word shows no meaning', () => {
    expect(wordMeaning({ functionWord: true }, 'topic marker particle')).toBeNull()
    expect(wordMeaning({ functionWord: false }, 'coffee')).toBe('coffee')
  })
})

test('a headword shows its reading without furigana unless it is its reading', () => {
  expect(readingWithoutFurigana('見る', 'みる')).toBe('みる')
  expect(readingWithoutFurigana('テレビ', 'テレビ')).toBeNull()
})
