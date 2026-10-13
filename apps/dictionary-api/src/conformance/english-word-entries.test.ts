import { searchDatabase } from '@zenbu/dictionary-core/artifact/database'
import {
  areAlwaysTogether,
  entriesExamplesUse
} from '@zenbu/dictionary-core/search/english-word-entries'
import { describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase } from './support'

describe.runIf(artifactAvailable)('the entries example sentences use, on the app’s data', () => {
  const named = async (words: string[]) =>
    entriesExamplesUse(searchDatabase(await artifactDatabase()), words)

  test.each([
    ['drinking', ['酒', '飲む']],
    ['watch', ['時計', '見る']],
    ['see', ['会う', '見る']],
    ['play', ['弾く', '遊ぶ']]
  ])('「%s」 names %o, the most used first', async (word, headwords) => {
    expect((await named([word])).get(word)?.map(entry => entry.headword)).toEqual(headwords)
  })

  test.each([
    ['station', '駅', true],
    ['hour', '一時間', false],
    ['post', '郵便局', false]
  ])('「%s」 names %s, which does not mean it; that they are always together is %s', async (word, headword, together) => {
    const [first] = (await named([word])).get(word) ?? []
    expect(first.headword).toBe(headword)
    expect(areAlwaysTogether(first)).toBe(together)
  })

  test('the small words that mean nothing on their own name none, nor does a word no pair has', async () => {
    expect(await named(['a', 'an', 'the', 'of', 'xyzzy'])).toEqual(new Map())
  })
})
