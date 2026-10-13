import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import {
  attachWordIndex,
  candidates,
  dictionary,
  type ExampleUse,
  listed,
  type Word,
  word
} from './english-sentence.fixture'
import { areSplitBetween, entriesExamplesUse, isASuruVerb, mentions } from './english-word-entries'
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

const suruVerb = (...meaning: Parameters<typeof word>): Word => ({
  ...word(...meaning),
  partsOfSpeech: ['noun', 'takesSuru']
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
  word('探す', 'さがす', 'sagasu', 'to search for', 'to look for'),
  word('見', 'み', 'mi', 'looking'),
  word('兄', 'あに', 'ani', 'older brother', 'elder brother'),
  word('入満', 'イルマン', 'iruman', 'brother'),
  word('私', 'わたし', 'watashi', 'I', 'me'),
  word('我が', 'わが', 'waga', 'my', 'our'),
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
  word('弾く', 'ひく', 'hiku', 'to play (a stringed instrument)'),
  word('遊ぶ', 'あそぶ', 'asobu', 'to play (games)'),
  word('教える', 'おしえる', 'oshieru', 'to teach', 'to tell'),
  word('話す', 'はなす', 'hanasu', 'to talk', 'to tell'),
  suruVerb('結婚', 'けっこん', 'kekkon', 'marriage'),
  word('既婚', 'きこん', 'kikon', 'married'),
  suruVerb('説明', 'せつめい', 'setsumei', 'explanation'),
  word('ドア', 'ドア', 'doa', 'door'),
  word('ドアーズ', 'ドアーズ', 'doa-zu', 'Doors'),
  word('アメリカ', 'アメリカ', 'amerika', 'America'),
  word('Ｓ', 'エス', 'esu', 'S')
]

const used: ExampleUse[] = [
  ['the', 'その'],
  ['it', 'ＩＴ'],
  ['pen', 'ペン', 120],
  ['pen', '書く', 20],
  ['went', '行く'],
  ['watching', 'テレビ'],
  ['watch', '時計', 255],
  ['watch', '見る', 137],
  ['drinking', '酒', 50],
  ['drinking', '飲む', 80],
  ['looking', '探す'],
  ['brother', '兄'],
  ['my', '私'],
  ['station', '駅'],
  ['hour', '一時間'],
  ['secret', '秘密'],
  ['fall', '秋', 54],
  ['fall', '落ちる', 27],
  ['man', '配置する', 30],
  ['man', '男', 100],
  ['good', '良い'],
  ['play', '弾く', 104],
  ['play', '遊ぶ', 89],
  ['tell', '教える', 208],
  ['tell', '話す', 116],
  ['married', '結婚'],
  ['explain', '説明'],
  ['papers', '説明'],
  ['door', 'ドア'],
  ['s', 'アメリカ']
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

const entriesFor = async (written: string) => (await entriesExamplesUse(db, [written])).get(written)

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

  test('come with the pairs they share with the word, and with their meanings', async () => {
    const [pen, write] = (await entriesFor('pen')) ?? []
    expect(pen).toMatchObject({ word: 'pen', headword: 'ペン', pairs_with_both: 120 })
    expect(JSON.parse(write.glosses)).toEqual(['to write', 'to pen'])
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

describe('an entry example sentences use mentions a word', () => {
  test.each([
    ['looking', ['look'], true],
    ['looking', ['looking', 'loo'], false],
    ['brother', ['brother'], true],
    ['brother', ['broth'], false],
    ['watching', ['watching', 'watch'], false]
  ])('the first entry of 「%s」 and one of %o: %s', async (written, mentioned, found) => {
    const [first] = (await entriesFor(written)) ?? []
    expect(mentions(first, mentioned)).toBe(found)
  })
})

describe('an entry example sentences use is a する verb', () => {
  test.each([
    ['married', '結婚', true],
    ['watching', 'テレビ', false],
    ['drinking', '酒', false]
  ])('the first entry of 「%s」, %s: %s', async (written, headword, found) => {
    const [first] = (await entriesFor(written)) ?? []
    expect(first.headword).toBe(headword)
    expect(isASuruVerb(first)).toBe(found)
  })
})

describe('example sentences are split between two entries', () => {
  test.each([
    ['the second is in seven pairs to the first’s ten', 10, 7, true],
    ['the second is in six pairs to the first’s ten', 10, 6, false],
    ['the second, a later meaning, is in more pairs', 10, 30, true]
  ])('when %s: %s', async (_, first, second, split) => {
    const [bow, play] = (await entriesFor('play')) ?? []
    const counted = [
      { ...bow, pairs_with_both: first },
      { ...play, pairs_with_both: second }
    ] as const
    expect(areSplitBetween(...counted)).toBe(split)
  })
})

describe('a word of an English sentence that is no other word’s form', () => {
  test('lists the entry its examples use most, as it is, whatever the entry means', async () => {
    const results = await search.search('rabbit station carrot')
    expect(candidates(results)).toEqual([['兎'], ['駅'], ['人参']])
    expect(results.items[1].matchedSummary).toBeNull()
    expect(matchLabel(1, results.items[1].matchRank)).toBe(
      'source=1 english exampleSentences romaji=0'
    )
    expect(await inASentence('station', withoutAWordIndex)).toEqual([['停留所']])
  })

  test.each([
    ['hour', '一時間', '時'],
    ['my', '私', '我が']
  ])('「%s」 lists %s, where the entries that mean it list %s', async (written, entry, meant) => {
    expect(await inASentence(written)).toEqual([[entry]])
    expect(await inASentence(written, withoutAWordIndex)).toEqual([[meant]])
  })

  test('lists that entry alone, with its meaning, where every entry that means it was listed', async () => {
    const results = await search.search('rabbit pen carrot')
    expect(candidates(results)).toEqual([['兎'], ['ペン'], ['人参']])
    expect(results.items[1].matchedSummary).toBe('pen')
    expect(await inASentence('pen', withoutAWordIndex)).toEqual([['ペン', '書く']])
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

describe('a word of an English sentence that is another word’s form', () => {
  test('lists the entry that means its base form, with that meaning', async () => {
    const results = await search.search('rabbit went carrot')
    expect(candidates(results)).toEqual([['兎'], ['行く'], ['人参']])
    expect(results.items[1].matchedSummary).toBe('to go')
    expect(await inASentence('went', withoutAWordIndex)).toEqual([['いらした', '行く']])
  })

  test.each([
    ['looking', '探す', 'to look for'],
    ['brother', '兄', 'older brother']
  ])('「%s」 lists %s, a meaning of which mentions it: "%s"', async (written, entry) => {
    expect(await inASentence(written)).toEqual([[entry]])
  })

  test('passes over an entry that mentions neither it nor its base form for the next', async () => {
    expect(await inASentence('drinking')).toEqual([['飲む']])
  })

  test('lists a する verb its examples use when it is a verb’s form, though no meaning mentions it', async () => {
    const results = await search.search('rabbit married carrot')
    expect(candidates(results)).toEqual([['兎'], ['結婚'], ['人参']])
    expect(results.items[1].matchedSummary).toBeNull()
    expect(await inASentence('married', withoutAWordIndex)).toEqual([['既婚']])
  })

  test('takes a する verb its base form’s examples use, read as a verb', async () => {
    expect(await inASentence('explaining')).toEqual([['説明']])
    expect(await inASentence('explained')).toEqual([['説明']])
  })

  test('takes no する verb when it is no verb’s form: 「papers」 is a plural', async () => {
    expect(await inASentence('papers')).toEqual([])
  })

  test('takes its base form’s entry when none of its own passes, read as a verb', async () => {
    const results = await search.search('rabbit watching carrot')
    expect(candidates(results)).toEqual([['兎'], ['見る'], ['人参']])
    expect(results.items[1].matchedSummary).toBe('to watch')
    expect(await inASentence('watching', withoutAWordIndex)).toEqual([['見物']])
  })

  test.each([
    ['fell', 'fall', ['落ちる']],
    ['falling', 'fall', ['落ちる']],
    ['falls', 'fall', ['秋']],
    ['men', 'man', ['男']],
    ['stations', 'station', ['駅']]
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
})

describe('a word of an English sentence whose examples are split', () => {
  test('brings each entry that means it and shares its use, and lists the more common', async () => {
    expect(await inASentence('play')).toEqual([['弾く', '遊ぶ']])
    expect(await listed(search, 'rabbit play')).toEqual(['兎', '弾く'])
    expect(await listed(search, 'rabbit play', { 遊ぶ: 5 })).toEqual(['兎', '遊ぶ'])
  })

  test('brings them for its forms too', async () => {
    expect(await inASentence('played')).toEqual([['弾く', '遊ぶ']])
    expect(await listed(search, 'rabbit played', { 遊ぶ: 5 })).toEqual(['兎', '遊ぶ'])
  })

  test.each([
    ['tell', ['教える']],
    ['pen', ['ペン']],
    ['fall', ['秋']]
  ])('「%s」 lists %o alone: the next entry that means it is in too few pairs', async (written, entries) => {
    expect(await inASentence(written)).toEqual([entries])
  })
})
