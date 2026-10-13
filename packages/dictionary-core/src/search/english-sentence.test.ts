import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test, vi } from 'vitest'
import { rankedByStrongGloss, rankedEnglish } from './english'
import { candidates, dictionary, listed, word } from './english-sentence.fixture'
import type { MorphologyWord } from './morphology'
import { EvidenceLane } from './rank'
import { DictionarySearch } from './search'

const db = dictionary(new DatabaseSync(':memory:'), [
  word('何処', 'どこ', 'doko', 'where', 'what place'),
  word('だ', 'だ', 'da', 'be', 'is'),
  word('その', 'その', 'sono', 'that', 'the'),
  word('風呂', 'ふろ', 'furo', 'bath', 'bathroom'),
  word('浴室', 'よくしつ', 'yokushitsu', 'bathroom', 'bath'),
  word('お陰様で', 'おかげさまで', 'okagesamade', 'thanks to his help'),
  word('アイスクリーム', 'アイスクリーム', 'aisukuri-mu', 'ice cream'),
  word('氷', 'こおり', 'koori', 'ice'),
  word('クリーム', 'クリーム', 'kuri-mu', 'cream'),
  word('お冷や', 'おひや', 'ohiya', 'water'),
  { ...word('水', 'みず', 'mizu', 'water'), isCommon: true },
  word('握り', 'にぎり', 'nigiri', 'sushi'),
  word('寿司', 'すし', 'sushi', 'sushi'),
  word('日本語', 'にほんご', 'nihongo', 'Japanese (language)'),
  word('勉強', 'べんきょう', 'benkyou', 'study'),
  word('する', 'する', 'suru', 'to do'),
  word('兎', 'うさぎ', 'usagi', 'rabbit'),
  word('人参', 'にんじん', 'ninjin', 'carrot'),
  word('牝鹿', 'めじか', 'mejika', 'doe'),
  word('猫', 'ねこ', 'neko', 'cat'),
  word('キャッツ', 'キャッツ', 'kyattsu', 'cats')
])

const search = new DictionarySearch(db)

describe('an English sentence', () => {
  test('brings, for each of its words in order, small ones included, the entries that mean it (#401)', async () => {
    const results = await search.search('Where is the bathroom?')
    expect(candidates(results)).toEqual([['何処'], ['だ'], ['その'], ['浴室', '風呂']])
    expect(results.items.map(item => item.matchedSummary)).toEqual([
      'where',
      'is',
      'the',
      'bathroom',
      'bathroom'
    ])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test.each([
    ['bathroom', {}],
    ['bathroom', { 風呂: 5 }],
    ['water', {}],
    ['water', { お冷や: 5 }],
    ['sushi', {}],
    ['sushi', { 握り: 5, 寿司: 1 }]
  ])('lists for 「%s」 the word its own results lead with, given the JLPT levels %o', async (meaning, levels) => {
    const [first] = await listed(search, meaning, levels)
    expect(await listed(search, `the ${meaning}`, levels)).toEqual(['その', first])
  })

  test('lists the word the dictionaries rank as more used, not the first one found', async () => {
    const sentence = 'where is the bathroom'
    expect(await listed(search, sentence)).toEqual(['何処', 'だ', 'その', '浴室'])
    expect(await listed(search, sentence, { 風呂: 5, 浴室: 1 })).toEqual([
      '何処',
      'だ',
      'その',
      '風呂'
    ])
  })

  test.each([
    'where',
    'is',
    'bathroom',
    'water',
    'sushi',
    'his',
    'do',
    'japanese'
  ])('ranks the words that mean 「%s」 as that word’s search ranks them', async meaning => {
    const searched = (await rankedEnglish(db, meaning)).filter(
      ranked => ranked.rank.kind === 'english' && ranked.rank.lane === EvidenceLane.strongGloss
    )
    expect(await rankedByStrongGloss(db, meaning)).toEqual(searched)
  })

  test('leaves out a word that no entry means, though an entry mentions it', async () => {
    expect(await listed(search, 'his')).toEqual(['お陰様で'])
    expect(candidates(await search.search('where is his xyzzy bathroom'))).toEqual([
      ['何処'],
      ['だ'],
      ['浴室', '風呂']
    ])
  })

  test('brings an entry for each word that means it, and lists it once', async () => {
    const sentence = 'is that the bathroom, the bathroom?'
    const results = await search.search(sentence)
    expect(candidates(results)).toEqual([['だ'], ['その'], ['その'], ['浴室', '風呂']])
    expect(results.items.slice(1, 3).map(item => item.matchedSummary)).toEqual(['that', 'the'])
    expect(await listed(search, sentence)).toEqual(['だ', 'その', '浴室'])
  })

  test('is searched as itself when an entry means the whole of it', async () => {
    const results = await search.search('ice cream')
    expect(candidates(results)).toEqual([['アイスクリーム']])
    expect(results).toMatchObject({ presentation: 'ranked', resolution: 'direct' })
  })

  test.each([
    ['one of its words alone has an entry', 'the xyzzy'],
    ['it is one word', 'bathroom?'],
    ['it holds a wildcard, which makes it a pattern', 'where is the bathr*'],
    ['it holds FTS4’s first-word mark', '^where is the bathroom']
  ])('lists nothing when %s', async (_, query) => {
    expect(await search.search(query)).toMatchObject({ items: [], presentation: 'ranked' })
  })

  test('needs no analyzer and asks none', async () => {
    const analyze = vi.fn(async (): Promise<MorphologyWord[]> => [])
    const analyzing = new DictionarySearch(db, { morphology: { analyze } })
    expect(candidates(await analyzing.search('where is the bathroom'))).toHaveLength(4)
    expect(analyze).not.toHaveBeenCalled()
  })
})

describe('an English word that no entry means as it is written', () => {
  test('brings the entries of its base form, and an irregular form brings none', async () => {
    const results = await search.search('The rabbits ate carrots.')
    expect(candidates(results)).toEqual([['その'], ['兎'], ['人参']])
    expect(results.items.map(item => item.matchedSummary)).toEqual(['the', 'rabbit', 'carrot'])
  })

  test('brings the entries of every base form it may have, and lists the more used of them', async () => {
    const sentence = 'the cat does'
    expect(candidates(await search.search(sentence))).toEqual([['その'], ['猫'], ['牝鹿', 'する']])
    expect(await listed(search, sentence)).toEqual(['その', '猫', '牝鹿'])
    expect(await listed(search, sentence, { する: 5 })).toEqual(['その', '猫', 'する'])
  })

  test('is not a word an entry does mean: 「cats」 keeps its own entry', async () => {
    expect(candidates(await search.search('the cats'))).toEqual([['その'], ['キャッツ']])
  })
})

describe('a long English sentence', () => {
  const made = (count: number, ending: string) =>
    Array.from({ length: count }, (_, index) => `${String.fromCharCode(97 + index)}${ending}`)
  const known = made(13, 'ux')
  const unknown = made(24, 'oz')
  const long = new DictionarySearch(
    dictionary(
      new DatabaseSync(':memory:'),
      known.map(meaning => word(meaning.toUpperCase(), meaning, meaning, meaning))
    )
  )
  const entries = (meanings: string[]) => meanings.map(meaning => [meaning.toUpperCase()])

  test('brings its first twelve words that have an entry', async () => {
    expect(candidates(await long.search(known.join(' ')))).toEqual(entries(known.slice(0, 12)))
  })

  test('looks up its first twenty-four words and no more', async () => {
    const [first, second] = known
    const within = [...unknown.slice(0, 22), first, second].join(' ')
    const beyond = [...unknown.slice(0, 23), first, second].join(' ')
    expect(candidates(await long.search(within))).toEqual(entries([first, second]))
    expect(candidates(await long.search(beyond))).toEqual([])
  })
})

describe('a sentence', () => {
  const analyzed = [
    ['日本語', '名詞'],
    ['を', '助詞'],
    ['勉強', '名詞'],
    ['する', '動詞']
  ].map(
    ([surface, partOfSpeech]): MorphologyWord => ({
      surface,
      dictionaryForm: surface,
      partOfSpeech: [partOfSpeech],
      isOutOfVocabulary: false
    })
  )

  test.each([
    ['日本語を勉強する', ['日本語', '勉強', 'する']],
    ['I do study Japanese.', ['する', '勉強', '日本語']]
  ])('lists its words as Discovered Words in Japanese and in English: 「%s」', async (sentence, words) => {
    const both = new DictionarySearch(db, { morphology: { analyze: async () => analyzed } })
    expect(await listed(both, sentence)).toEqual(words)
    expect(await both.search(sentence)).toMatchObject({
      presentation: 'discoveredWords',
      resolution: 'analyzed'
    })
  })
})
