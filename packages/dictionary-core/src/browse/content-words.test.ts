import { describe, expect, test } from 'vitest'
import { isContentWord } from './content-words'

describe('isContentWord, the words the dictionary home shows as common', () => {
  test.each([
    ['の', ['particle'], ['particle']],
    ['と', ['conjunction', 'particle'], ['particle', 'conjunction', 'noun']],
    ['です', ['auxiliaryVerb', 'copula'], ['auxiliaryVerb', 'copula']],
    ['たい', ['auxiliaryAdjective', 'iAdjective'], ['auxiliaryAdjective', 'iAdjective']],
    ['そして', ['conjunction'], ['conjunction']],
    ['達', ['suffix'], ['suffix']],
    ['第', ['prefix'], ['prefix']]
  ])('leaves out %s, whose first meaning is a function word or which is only an affix', (_, first, all) => {
    expect(isContentWord(first, all)).toBe(false)
  })

  test.each([
    ['する', ['suruVerb'], ['suruVerb', 'intransitive', 'transitive', 'suffix', 'auxiliaryVerb']],
    ['事', ['noun'], ['noun']],
    ['所', ['noun'], ['adverb', 'noun', 'suffix']],
    ['無い', ['iAdjective'], ['iAdjective', 'auxiliaryAdjective']]
  ])('keeps %s, whose first meaning is a content word', (_, first, all) => {
    expect(isContentWord(first, all)).toBe(true)
  })
})
