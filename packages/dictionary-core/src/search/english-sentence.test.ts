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
  { ...word('です', 'です', 'desu', 'be', 'is'), jmdictEntry: 1628500 },
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
  { ...word('する', 'する', 'suru', 'to do'), jmdictEntry: 1157170 }
])

const search = new DictionarySearch(db)

describe('an English sentence', () => {
  test('brings, for each of its words in order, the entries that mean it (#401)', async () => {
    const results = await search.search('Where is the bathroom?')
    expect(candidates(results)).toEqual([['何処'], ['です'], ['浴室', '風呂']])
    expect(results.items.map(item => item.matchedSummary)).toEqual([
      'where',
      'is',
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
    expect(await listed(search, `where ${meaning}`, levels)).toEqual(['何処', first])
  })

  test('lists the word the dictionaries rank as more used, not the first one found', async () => {
    const sentence = 'where is the bathroom'
    expect(await listed(search, sentence)).toEqual(['何処', 'です', '浴室'])
    expect(await listed(search, sentence, { 風呂: 5, 浴室: 1 })).toEqual(['何処', 'です', '風呂'])
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
      ['です'],
      ['浴室', '風呂']
    ])
  })

  test('brings an entry for each word that means it, and lists it once', async () => {
    const sentence = 'is the bath a bathroom?'
    const results = await search.search(sentence)
    expect(candidates(results)).toEqual([['です'], ['風呂', '浴室'], ['浴室', '風呂']])
    expect(results.items.map(item => item.matchedSummary)).toEqual([
      'is',
      'bath',
      'bath',
      'bathroom',
      'bathroom'
    ])
    expect(await listed(search, sentence)).toEqual(['です', '風呂', '浴室'])
    expect(await listed(search, sentence, { 風呂: 5 })).toEqual(['です', '風呂'])
  })

  test('is searched as itself when an entry means the whole of it', async () => {
    const results = await search.search('ice cream')
    expect(candidates(results)).toEqual([['アイスクリーム']])
    expect(results).toMatchObject({ presentation: 'ranked', resolution: 'direct' })
  })

  test.each([
    ['one of its words alone has an entry', 'where xyzzy'],
    ['it is one word', 'bathroom?'],
    ['it holds a wildcard, which makes it a pattern', 'where is the bathr*'],
    ['it holds FTS4’s first-word mark', '^where is the bathroom']
  ])('lists nothing when %s', async (_, query) => {
    expect(await search.search(query)).toMatchObject({ items: [], presentation: 'ranked' })
  })

  test('needs no analyzer and asks none', async () => {
    const analyze = vi.fn(async (): Promise<MorphologyWord[]> => [])
    const analyzing = new DictionarySearch(db, { morphology: { analyze } })
    expect(candidates(await analyzing.search('where is the bathroom'))).toHaveLength(3)
    expect(analyze).not.toHaveBeenCalled()
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
