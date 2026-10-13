import { searchDatabase } from '@zenbu/dictionary-core/artifact/database'
import {
  areSplitBetween,
  entriesExamplesUse,
  mentions
} from '@zenbu/dictionary-core/search/english-word-entries'
import { describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase } from './support'

describe.runIf(artifactAvailable)('the entries example sentences use, on the app’s data', () => {
  const named = async (words: string[]) =>
    entriesExamplesUse(searchDatabase(await artifactDatabase()), words)

  const entriesOf = async (word: string) => (await named([word])).get(word) ?? []

  test.each([
    ['drinking', ['酒', '飲む']],
    ['watch', ['時計', '見る']],
    ['see', ['会う', '見る']],
    ['play', ['弾く', '遊ぶ']],
    ['tell', ['教える', '話す']]
  ])('「%s」 names %o, the most used first', async (word, headwords) => {
    expect((await entriesOf(word)).map(entry => entry.headword)).toEqual(headwords)
  })

  test.each([
    ['see', true],
    ['play', true],
    ['tell', false],
    ['watch', false]
  ])('the examples of 「%s」 are split between its first two entries: %s', async (word, split) => {
    const [first, second] = await entriesOf(word)
    expect(areSplitBetween(first, second)).toBe(split)
  })

  test.each([
    ['looking', '探す', 'look', true],
    ['watching', 'テレビ', 'watch', false],
    ['drinking', '酒', 'drink', false]
  ])('the first entry of 「%s」, %s, mentions "%s" in a meaning: %s', async (word, headword, mentioned, found) => {
    const [first] = await entriesOf(word)
    expect(first.headword).toBe(headword)
    expect(mentions(first, [mentioned])).toBe(found)
  })

  test.each([
    ['york', ['ニューヨーク']],
    ['tokyo', ['東京']],
    ['tony', []],
    ['edison', []]
  ])('the name 「%s」 names %o: only an entry that means or mentions it', async (word, headwords) => {
    expect((await entriesOf(word)).map(entry => entry.headword)).toEqual(headwords)
  })

  test('the small words that mean nothing on their own name none, nor does a word no pair has', async () => {
    expect(await named(['a', 'an', 'the', 'of', 'xyzzy'])).toEqual(new Map())
  })
})
