import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  fixedEntries,
  wordsThatListNothing
} from '@zenbu/dictionary-core/search/english-function-words'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary, sudachiAvailable } from './support'

const headwordsOfTheFixedEntries: Record<number, string> = {
  1628500: 'です',
  2819970: 'だった',
  1006970: 'それ',
  2257550: 'ない',
  1340450: '出来る',
  1254130: '決して',
  1157170: 'する'
}

describe.runIf(artifactAvailable && sudachiAvailable)('sentence search', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: true })
  })

  async function listedFor(word: string) {
    const { screen } = await service.search(`${word} zebra xylophone`)
    if (screen.state !== 'results') throw new Error(`「${word} zebra xylophone」 lists nothing`)
    expect(screen.rows.slice(-2).map(row => row.headword)).toEqual(['縞馬', '木琴'])
    return screen.rows.length === 3 ? screen.rows[0] : undefined
  }

  test.each([
    ['日本語を勉強する', ['日本語', '勉強', 'する']],
    ['Where is the bathroom?', ['何処', 'です', '風呂']],
    ['I want to go home.', ['私', '要る', '行く', '家庭']],
    ['The rabbits ate carrots.', ['兎', '食べる', '人参']]
  ])('「%s」 lists its words as Discovered Words (#401)', async (sentence, words) => {
    const { screen } = await service.search(sentence)
    expect(screen.state).toBe('results')
    if (screen.state !== 'results') return
    expect(screen.sections).toContain('discoveredWords')
    expect(screen.rows.map(row => row.headword)).toEqual(words)
  })

  test('an English sentence’s rows each show the meaning that is its word', async () => {
    const { screen } = await service.search('Where is the bathroom?')
    expect(screen.state === 'results' && screen.rows.map(row => row.summary)).toEqual([
      'where',
      'is',
      'bathroom'
    ])
  })

  test.each([
    'where',
    'is',
    'bathroom',
    'i',
    'go',
    'home'
  ])('an English sentence lists for 「%s」 the row its own results lead with', async word => {
    const own = await service.search(word)
    const sentence = await service.search(`${word} zebra`)
    if (own.screen.state !== 'results' || sentence.screen.state !== 'results') {
      throw new Error(`「${word}」 lists nothing`)
    }
    expect(sentence.screen.sections).toContain('discoveredWords')
    expect(sentence.screen.rows[0]).toMatchObject({
      id: own.screen.rows[0].id,
      headword: own.screen.rows[0].headword
    })
  })

  test.each([
    ...wordsThatListNothing
  ])('「%s」, which has no Japanese counterpart, lists nothing in a sentence', async word => {
    expect(await listedFor(word)).toBeUndefined()
  })

  test.each([
    ...fixedEntries
  ])('「%s」 lists its fixed entry, under the headword intended', async (word, { jmdictEntry }) => {
    expect(await listedFor(word)).toMatchObject({
      entSeq: jmdictEntry,
      headword: headwordsOfTheFixedEntries[jmdictEntry]
    })
  })

  test('every fixed entry’s intended headword is written down here', () => {
    const fixed = [...fixedEntries.values()].map(({ jmdictEntry }) => jmdictEntry)
    expect(new Set(fixed)).toEqual(new Set(Object.keys(headwordsOfTheFixedEntries).map(Number)))
  })

  test.each([
    ['ate', '食べる', 'to eat'],
    ['went', '行く', 'to go'],
    ['came', '来る', 'to come'],
    ['saw', '見る', 'to see'],
    ['bought', '買う', 'to buy'],
    ['taught', '教える', 'to teach'],
    ['drank', '飲む', 'to drink'],
    ['forgot', '忘れる', 'to forget'],
    ['written', '書く', 'to write']
  ])('the irregular form 「%s」 lists %s, "%s"', async (word, headword, meaning) => {
    expect(await listedFor(word)).toMatchObject({
      headword,
      summary: expect.stringContaining(meaning)
    })
  })

  test.each([
    ['gave', /^to give( \(|$)/],
    ['been', /^to be( \(|$)/],
    ['has', /^to have( \(|$)/]
  ])('the irregular form 「%s」 lists an entry whose meaning is %s', async (word, meaning) => {
    expect((await listedFor(word))?.summary).toMatch(meaning)
  })

  test.each([
    ['taller', ['高い']],
    ['colder', ['寒い', '冷たい']],
    ['bigger', ['大きい']],
    ['heavier', ['重い']]
  ])('the comparative 「%s」 lists its adjective, one of %o', async (word, headwords) => {
    expect(headwords).toContain((await listedFor(word))?.headword)
  })

  test.each([
    ['secreted', 'secret'],
    ['incoming', 'income']
  ])('「%s」 lists nothing: it is no form of %s, which is no verb', async word => {
    expect(await listedFor(word)).toBeUndefined()
  })

  test.each([
    ['dogs', '犬'],
    ['played', '遊ぶ'],
    ['sleeping', '眠り'],
    ['best', '最高'],
    ['left', '左'],
    ['people', '人々']
  ])('「%s」 still lists %s', async (word, headword) => {
    expect(await listedFor(word)).toMatchObject({ headword })
  })

  test.each([
    '勉強',
    'ice cream'
  ])('「%s」, which the dictionary holds, is still searched as itself', async held => {
    const results = await service.searchResults(held)
    expect(results.resolution).toBe('direct')
    expect(results.presentation).toBe('ranked')
  })

  test.each([
    'is',
    'the',
    'saw'
  ])('「%s」 alone is still searched as any word, by every entry that means it', async word => {
    const results = await service.searchResults(word)
    expect(results.resolution).toBe('direct')
    expect(results.presentation).toBe('ranked')
    expect(results.items.length).toBeGreaterThan(1)
  })

  test("the service reports sentence search, which the website didn't have before", () => {
    expect(service.features.sentenceSearch).toBe(true)
  })
})
