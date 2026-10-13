import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import {
  attachWordIndex,
  candidates,
  dictionary,
  type ExampleUse,
  type Word,
  word
} from './english-sentence.fixture'
import { areAlwaysTogether, entriesExamplesUse } from './english-word-entries'
import { matchLabel } from './rank'
import { DictionarySearch } from './search'

const noun = (...meaning: Parameters<typeof word>): Word => ({
  ...word(...meaning),
  partsOfSpeech: ['noun']
})

const adjective = (...meaning: Parameters<typeof word>): Word => ({
  ...word(...meaning),
  partsOfSpeech: ['iAdjective']
})

const words: Word[] = [
  word('兎', 'うさぎ', 'usagi', 'rabbit'),
  word('人参', 'にんじん', 'ninjin', 'carrot'),
  word('その', 'その', 'sono', 'that', 'the'),
  { ...word('それ', 'それ', 'sore', 'that', 'it'), jmdictEntry: 1006970 },
  word('ＩＴ', 'アイティー', 'aiti-', 'IT'),
  word('ペン', 'ペン', 'pen', 'pen'),
  word('書く', 'かく', 'kaku', 'to write', 'to pen'),
  word('行く', 'いく', 'iku', 'to go', 'to move (towards)'),
  word('いらした', 'いらした', 'irashita', 'went'),
  word('テレビ', 'テレビ', 'terebi', 'television', 'TV'),
  word('見物', 'けんぶつ', 'kenbutsu', 'watching'),
  noun('時計', 'とけい', 'tokei', 'watch'),
  word('見る', 'みる', 'miru', 'to see', 'to watch'),
  word('酒', 'さけ', 'sake', 'alcohol'),
  word('飲み', 'のみ', 'nomi', 'drinking'),
  word('飲む', 'のむ', 'nomu', 'to drink'),
  word('駅', 'えき', 'eki', 'railway station', 'train station'),
  word('停留所', 'ていりゅうじょ', 'teiryuujo', 'station'),
  word('一時間', 'いちじかん', 'ichijikan', 'one hour'),
  word('時', 'じ', 'ji', 'hour'),
  word('秘密', 'ひみつ', 'himitsu', 'secret'),
  noun('秋', 'あき', 'aki', 'autumn', 'fall'),
  word('落ちる', 'おちる', 'ochiru', 'to fall'),
  word('降る', 'ふる', 'furu', 'to fall (of rain)'),
  word('配置する', 'はいちする', 'haichisuru', 'to man'),
  noun('男', 'おとこ', 'otoko', 'man'),
  adjective('良い', 'よい', 'yoi', 'good'),
  adjective('最高', 'さいこう', 'saikou', 'best'),
  word('ドア', 'ドア', 'doa', 'door'),
  word('ドアーズ', 'ドアーズ', 'doa-zu', 'Doors'),
  word('アメリカ', 'アメリカ', 'amerika', 'America'),
  word('Ｓ', 'エス', 'esu', 'S')
]

const alwaysTogether = [569, 637, 580] as const
const oftenTogether = [177, 277, 192] as const

const used: ExampleUse[] = [
  ['the', 'その'],
  ['it', 'ＩＴ'],
  ['pen', 'ペン'],
  ['pen', '書く'],
  ['went', '行く'],
  ['watching', 'テレビ'],
  ['watch', '時計'],
  ['watch', '見る'],
  ['drinking', '酒'],
  ['drinking', '飲む'],
  ['station', '駅', ...alwaysTogether],
  ['hour', '一時間', ...oftenTogether],
  ['secret', '秘密'],
  ['fall', '秋'],
  ['fall', '落ちる'],
  ['man', '配置する'],
  ['man', '男'],
  ['good', '良い'],
  ['door', 'ドア'],
  ['s', 'アメリカ', ...alwaysTogether]
]

function opened(uses: readonly ExampleUse[] | null) {
  const database = new DatabaseSync(':memory:')
  const db = dictionary(database, words)
  if (uses) attachWordIndex(database, uses)
  return { database, db }
}

const { db } = opened(used)
const search = new DictionarySearch(db)
const withoutAWordIndex = new DictionarySearch(opened(null).db)

const inASentence = async (written: string, searching = search) =>
  candidates(await searching.search(`rabbit ${written} carrot`)).slice(1, -1)

describe('the entries example sentences use for English words', () => {
  const headwords = async (asked: string[], from = db) =>
    Object.fromEntries(
      [...(await entriesExamplesUse(from, asked))].map(([written, entries]) => [
        written,
        entries.map(entry => entry.headword)
      ])
    )

  test('are, for each word the word index holds, its entries with the most used first', async () => {
    expect(await headwords(['rabbit', 'pen', 'went', 'pen'])).toEqual({
      pen: ['ペン', '書く'],
      went: ['行く']
    })
  })

  test('come with the pairs that hold the word, the entry, and both', async () => {
    const [station] = (await entriesExamplesUse(db, ['station'])).get('station') ?? []
    expect(station).toMatchObject({
      word: 'station',
      headword: '駅',
      pairs_with_both: 569,
      pairs_with_word: 637,
      pairs_with_entry: 580
    })
  })

  test('are none for a word of one letter, a piece of an abbreviation such as U.S.', async () => {
    expect(await headwords(['s', 'pen'])).toEqual({ pen: ['ペン', '書く'] })
    expect(await headwords(['s'])).toEqual({})
  })

  test('are none where no word index is attached, or for no words', async () => {
    expect(await headwords(['pen'], opened(null).db)).toEqual({})
    expect(await headwords([])).toEqual({})
  })

  test('leave out an entry the dictionary does not hold', async () => {
    const other = opened(used)
    other.database.exec("DELETE FROM entries WHERE headword = 'ペン'")
    expect(await headwords(['pen'], other.db)).toEqual({ pen: ['書く'] })
  })
})

describe('a word and an entry are always together in example sentences', () => {
  test.each([
    ['station and 駅', true, ...alwaysTogether],
    ['hour and 一時間', false, ...oftenTogether],
    ['all three pairs with the word, of the four with the entry', true, 3, 3, 4],
    ['six of the seven pairs with the word, and of the seven with the entry', false, 6, 7, 7]
  ])('%s: %s', async (_, together, both, withWord, withEntry) => {
    const [station] = (await entriesExamplesUse(db, ['station'])).get('station') ?? []
    const counted = {
      ...station,
      pairs_with_both: both,
      pairs_with_word: withWord,
      pairs_with_entry: withEntry
    }
    expect(areAlwaysTogether(counted)).toBe(together)
  })
})

describe('a word of an English sentence that example sentences use', () => {
  test('lists the entry they use most, alone, where every entry that means it was listed', async () => {
    expect(await inASentence('pen')).toEqual([['ペン']])
    expect(await inASentence('pen', withoutAWordIndex)).toEqual([['ペン', '書く']])
  })

  test('lists the entry that means its base form, with that meaning', async () => {
    const results = await search.search('rabbit went carrot')
    expect(candidates(results)).toEqual([['兎'], ['行く'], ['人参']])
    expect(results.items[1].matchedSummary).toBe('to go')
    expect(await inASentence('went', withoutAWordIndex)).toEqual([['いらした', '行く']])
  })

  test('passes over an entry that only keeps it company for the next that means it', async () => {
    expect(await inASentence('drinking')).toEqual([['飲む']])
  })

  test('takes its base form’s entry when none of its own means it, read as a verb', async () => {
    const results = await search.search('rabbit watching carrot')
    expect(candidates(results)).toEqual([['兎'], ['見る'], ['人参']])
    expect(results.items[1].matchedSummary).toBe('to watch')
    expect(await inASentence('watching', withoutAWordIndex)).toEqual([['見物']])
  })

  test.each([
    ['fell', 'fall', ['落ちる']],
    ['falling', 'fall', ['落ちる']],
    ['falls', 'fall', ['秋']],
    ['men', 'man', ['男']]
  ])('「%s」 takes the entry examples use for %s as the word reads it, %o', async (written, _, entries) => {
    expect(await inASentence(written)).toEqual([entries])
  })

  test('takes its base form’s entry over one that means it as written: 「doors」 is 「door」', async () => {
    expect(await inASentence('doors')).toEqual([['ドア']])
    expect(await inASentence('doors', withoutAWordIndex)).toEqual([['ドアーズ']])
  })

  test('is not its base form where no entry has the base as a verb: 「secreted」', async () => {
    expect(await inASentence('secreted')).toEqual([])
  })

  test('is not taken to its base form when it is a comparative: 「best」 keeps 最高', async () => {
    expect(await inASentence('best')).toEqual([['最高']])
  })

  test('lists an entry that does not mean it when the two are always together', async () => {
    const results = await search.search('rabbit station carrot')
    expect(candidates(results)).toEqual([['兎'], ['駅'], ['人参']])
    expect(results.items[1].matchedSummary).toBeNull()
    expect(matchLabel(1, results.items[1].matchRank)).toBe(
      'source=1 english exampleSentences romaji=0'
    )
    expect(await inASentence('stations')).toEqual([['駅']])
    expect(await inASentence('station', withoutAWordIndex)).toEqual([['停留所']])
  })

  test('falls back on the entries that mean it when the two are only often together', async () => {
    expect(await inASentence('hour')).toEqual([['時']])
  })

  test('is not asked of the examples when it is one letter', async () => {
    expect(await inASentence('s')).toEqual([['Ｓ']])
  })

  test.each([
    ['the', []],
    ['it', [['それ']]]
  ])('「%s」 still lists nothing or its fixed entry, whatever examples use', async (written, entries) => {
    expect(await inASentence(written)).toEqual(entries)
  })
})
