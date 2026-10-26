import { describe, expect, test } from 'vitest'
import { wordMeaning } from './word-meaning'

const word = (partOfSpeech: string) => ({ partOfSpeech: [partOfSpeech] })

describe('the short meaning under a linked word', () => {
  test('is its first meaning, shortened as the app shortens it', () => {
    expect(wordMeaning(word('名詞'), 'husband')).toBe('husband')
    expect(wordMeaning(word('動詞'), 'to wipe, to dry')).toBe('wipe')
    expect(wordMeaning(word('名詞'), 'brothers and sisters, siblings')).toBe('brothers and sist…')
    expect(wordMeaning(word('動詞'), 'to fold (clothes, etc.), to shut')).toBe('fold')
    expect(wordMeaning(word('名詞'), '(the) above, over, up')).toBe('above')
  })

  test('is left out for a particle, an auxiliary, or a symbol, as the app leaves it out', () => {
    for (const functionWord of ['助詞', '助動詞', '記号', '補助記号']) {
      expect(wordMeaning(word(functionWord), 'topic marker particle')).toBeNull()
    }
  })

  test('is left out for a word with no meaning, or only a note', () => {
    expect(wordMeaning(word('名詞'), null)).toBeNull()
    expect(wordMeaning(word('名詞'), '(only a note)')).toBeNull()
  })
})
