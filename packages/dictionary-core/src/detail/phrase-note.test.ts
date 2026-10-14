import { describe, expect, test } from 'vitest'
import { phraseNote } from './phrase-note'

const meanings = ['the last stand', 'fighting with one’s back to the wall', 'no retreat', 'fourth']

describe('phraseNote (ImageTextNote)', () => {
  test('notes an expression, whatever its length, with its first three meanings', () => {
    expect(phraseNote('猫舌', { meanings, partsOfSpeech: ['expression', 'noun'] })).toBe(
      'the last stand; fighting with one’s back to the wall; no retreat'
    )
  })

  test('notes any other entry only when its phrase is four or more characters long', () => {
    const noun = { meanings: ['the last stand'], partsOfSpeech: ['noun'] }
    expect(phraseNote('背水の陣', noun)).toBe('the last stand')
    expect(phraseNote('背水陣', noun)).toBeNull()
  })

  test('counts characters as a reader does, a kana and its combining mark as one', () => {
    const noun = { meanings: ['a'], partsOfSpeech: ['noun'] }
    expect(phraseNote('か\u{3099}か\u{3099}か', noun)).toBeNull()
    expect(phraseNote('か\u{3099}か\u{3099}か\u{3099}か', noun)).toBe('a')
  })
})
