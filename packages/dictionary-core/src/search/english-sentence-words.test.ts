import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { irregularBaseFormsOf } from '../examples/english-inflection'
import { fixedEntries, wordsThatListNothing } from './english-function-words'
import { candidates, dictionary, listed, type Word, word } from './english-sentence.fixture'
import { DictionarySearch } from './search'

const adjective = (...meaning: Parameters<typeof word>): Word => ({
  ...word(...meaning),
  partsOfSpeech: ['iAdjective']
})

const noun = (...meaning: Parameters<typeof word>): Word => ({
  ...word(...meaning),
  partsOfSpeech: ['noun']
})

const functionWords = [
  word('その', 'その', 'sono', 'that', 'the'),
  word('優', 'ゆう', 'yuu', 'A'),
  word('アン', 'アン', 'an', 'an'),
  word('まで', 'まで', 'made', 'to', 'until'),
  word('ｄｅ', 'ドゥ', 'dwu', 'of'),
  word('意志', 'いし', 'ishi', 'will'),
  { ...word('です', 'です', 'desu', 'be', 'is'), jmdictEntry: 1628500 },
  word('だ', 'だ', 'da', 'be', 'is'),
  word('振幅変調', 'しんぷくへんちょう', 'shinpukuhenchou', 'AM'),
  word('アール', 'アール', 'a-ru', 'are'),
  { ...word('だった', 'だった', 'datta', 'was', 'were'), jmdictEntry: 2819970 },
  word('やった', 'やった', 'yatta', 'was', 'were'),
  { ...word('それ', 'それ', 'sore', 'that', 'it'), jmdictEntry: 1006970 },
  word('ＩＴ', 'アイティー', 'aiti-', 'IT'),
  { ...word('ない', 'ない', 'nai', 'not'), jmdictEntry: 2257550 },
  word('ず', 'ず', 'zu', 'not (doing)'),
  { ...word('出来る', 'できる', 'dekiru', 'to be able to do'), jmdictEntry: 1340450 },
  word('缶', 'かん', 'kan', 'can'),
  { ...word('決して', 'けっして', 'kesshite', '(not) ever', '(not) at all'), jmdictEntry: 1254130 },
  word('豈', 'あに', 'ani', 'never'),
  { ...word('する', 'する', 'suru', 'to do', 'to carry out'), jmdictEntry: 1157170 },
  word('行う', 'おこなう', 'okonau', 'to do'),
  word('牝鹿', 'めじか', 'mejika', 'doe'),
  word('た', 'た', 'ta', 'did')
]

const db = dictionary(new DatabaseSync(':memory:'), [
  ...functionWords,
  word('兎', 'うさぎ', 'usagi', 'rabbit'),
  word('人参', 'にんじん', 'ninjin', 'carrot'),
  word('猫', 'ねこ', 'neko', 'cat'),
  word('キャッツ', 'キャッツ', 'kyattsu', 'cats'),
  word('食べる', 'たべる', 'taberu', 'to eat'),
  word('鋸', 'のこぎり', 'nokogiri', 'saw'),
  word('見る', 'みる', 'miru', 'to see'),
  word('灯す', 'ともす', 'tomosu', 'to light'),
  adjective('軽い', 'かるい', 'karui', 'light'),
  word('有る', 'ある', 'aru', 'to be'),
  noun('存在', 'そんざい', 'sonzai', 'being'),
  word('フィート', 'フィート', 'fi-to', 'feet'),
  noun('足', 'あし', 'ashi', 'foot'),
  word('支払う', 'しはらう', 'shiharau', 'to foot'),
  word('劇', 'げき', 'geki', 'play'),
  word('遊ぶ', 'あそぶ', 'asobu', 'to play'),
  word('秘密', 'ひみつ', 'himitsu', 'secret'),
  word('収入', 'しゅうにゅう', 'shuunyuu', 'income'),
  word('樅', 'もみ', 'momi', 'fir'),
  word('火', 'ひ', 'hi', 'fire'),
  word('撃つ', 'うつ', 'utsu', 'to fire'),
  word('跳ぶ', 'とぶ', 'tobu', 'to hop'),
  word('望む', 'のぞむ', 'nozomu', 'to hope'),
  word('入浴させる', 'にゅうよくさせる', 'nyuuyokusaseru', 'to bath'),
  word('浴びる', 'あびる', 'abiru', 'to bathe'),
  adjective('高い', 'たかい', 'takai', 'tall'),
  adjective('寒い', 'さむい', 'samui', 'cold'),
  noun('風邪', 'かぜ', 'kaze', 'cold'),
  adjective('大きい', 'おおきい', 'ookii', 'big'),
  adjective('重い', 'おもい', 'omoi', 'heavy'),
  adjective('可愛い', 'かわいい', 'kawaii', 'cute', 'pet'),
  adjective('良い', 'よい', 'yoi', 'good'),
  adjective('悪い', 'わるい', 'warui', 'bad'),
  adjective('最高', 'さいこう', 'saikou', 'best')
])

const search = new DictionarySearch(db)

const inASentence = async (written: string) =>
  candidates(await search.search(`rabbit ${written} carrot`)).slice(1, -1)

const searchedAlone = async (query: string) =>
  (await search.search(query)).items.map(item => item.entry.headword)

describe('a word of an English sentence with no Japanese counterpart', () => {
  test('is one of a, an, the, of, to and will', () => {
    expect([...wordsThatListNothing]).toEqual(['a', 'an', 'the', 'of', 'to', 'will'])
  })

  test.each([
    ...wordsThatListNothing
  ])('「%s」 lists nothing, though an entry means it', async silent => {
    expect(await searchedAlone(silent)).not.toEqual([])
    expect(await inASentence(silent)).toEqual([])
  })

  test('still counts as a word of the sentence, so the other word is listed', async () => {
    const results = await search.search('the rabbit')
    expect(candidates(results)).toEqual([['兎']])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test.each([
    'the xyzzy',
    'of the to'
  ])('「%s」, where no word lists an entry, lists nothing', async sentence => {
    expect(await search.search(sentence)).toMatchObject({ items: [], presentation: 'ranked' })
  })

  test('is still searched for when it is the whole query', async () => {
    const results = await search.search('the')
    expect(results.items.map(item => item.entry.headword)).toEqual(['その'])
    expect(results).toMatchObject({ presentation: 'ranked', resolution: 'direct' })
  })
})

describe('a word of an English sentence with a fixed entry', () => {
  test.each([
    ['am', 'です', 'be'],
    ['is', 'です', 'is'],
    ['are', 'です', 'be'],
    ['was', 'だった', 'was'],
    ['were', 'だった', 'were'],
    ['it', 'それ', 'it'],
    ['not', 'ない', 'not'],
    ['can', '出来る', 'to be able to do'],
    ['never', '決して', '(not) ever'],
    ['do', 'する', 'to do'],
    ['does', 'する', 'to do'],
    ['did', 'する', 'to do']
  ])('「%s」 lists %s alone, as "%s", whatever else means the word', async (written, headword, meaning) => {
    const results = await search.search(`rabbit ${written} carrot`)
    const [, own] = candidates(results)
    expect(own).toEqual([headword])
    expect(results.items[1].matchedSummary).toBe(meaning)
  })

  test('every word with a fixed entry is covered above', () => {
    expect([...fixedEntries.keys()]).toEqual([
      'am',
      'is',
      'are',
      'was',
      'were',
      'it',
      'not',
      'can',
      'never',
      'do',
      'does',
      'did'
    ])
  })

  test('lists nothing when the data has no such entry', async () => {
    const without = new DictionarySearch(
      dictionary(new DatabaseSync(':memory:'), [
        word('だ', 'だ', 'da', 'be', 'is'),
        word('兎', 'うさぎ', 'usagi', 'rabbit'),
        word('人参', 'にんじん', 'ninjin', 'carrot')
      ])
    )
    expect(candidates(await without.search('rabbit is carrot'))).toEqual([['兎'], ['人参']])
  })

  test('is still searched for as any word when it is the whole query', async () => {
    expect((await searchedAlone('is')).slice(0, 2)).toEqual(['だ', 'です'])
    expect(await searchedAlone('it')).toEqual(['ＩＴ', 'それ'])
  })
})

describe('an irregular form in an English sentence', () => {
  test.each([
    ...wordsThatListNothing,
    ...fixedEntries.keys()
  ])('is never 「%s」, which lists nothing or its fixed entry first', written => {
    expect(irregularBaseFormsOf(written)).toEqual([])
  })

  test('brings its base form’s entries, where it used to bring none', async () => {
    const results = await search.search('The rabbits ate carrots.')
    expect(candidates(results)).toEqual([['兎'], ['食べる'], ['人参']])
    expect(results.items.map(item => item.matchedSummary)).toEqual(['rabbit', 'to eat', 'carrot'])
  })

  test('weighs its own entries against its base form’s, and lists the more used', async () => {
    expect(await inASentence('saw')).toEqual([['鋸', '見る']])
    expect(await listed(search, 'rabbit saw')).toEqual(['兎', '鋸'])
    expect(await listed(search, 'rabbit saw', { 見る: 5 })).toEqual(['兎', '見る'])
  })

  test.each([
    ['lit', 'light', ['灯す']],
    ['been', 'be', ['有る']],
    ['being', 'be', ['存在', '有る']]
  ])('「%s」 brings the entries that mean "to %s", not every entry of that spelling', async (written, _, entries) => {
    expect(await inASentence(written)).toEqual([entries])
  })

  test('a plural brings its singular’s nouns beside its own entries', async () => {
    expect(await inASentence('feet')).toEqual([['フィート', '足']])
    expect(await listed(search, 'rabbit feet', { 足: 5 })).toEqual(['兎', '足'])
  })

  test('alone is still searched for as it is written', async () => {
    expect(await searchedAlone('saw')).toEqual(['鋸'])
    expect(await searchedAlone('lit')).toEqual([])
  })
})

describe('a regular form in an English sentence', () => {
  test('keeps the entry that means it as written: 「cats」 is not 「cat」', async () => {
    expect(await inASentence('cats')).toEqual([['キャッツ']])
  })

  test('brings the entries of every base form it may have, and lists the more used', async () => {
    expect(await inASentence('bathed')).toEqual([['入浴させる', '浴びる']])
    expect(await listed(search, 'rabbit bathed')).toEqual(['兎', '入浴させる'])
    expect(await listed(search, 'rabbit bathed', { 浴びる: 5 })).toEqual(['兎', '浴びる'])
  })

  test('「hoping」 is 「hope」 alone: 「hop」 would make 「hopping」', async () => {
    expect(await inASentence('hoping')).toEqual([['望む']])
    expect(await inASentence('hopping')).toEqual([['跳ぶ']])
  })

  test.each([
    ['played', 'play', ['劇', '遊ぶ']],
    ['playing', 'play', ['劇', '遊ぶ']],
    ['fired', 'fire', ['火', '撃つ']]
  ])('「%s」 brings every entry of %s, a base the dictionary has as a verb', async (written, _, entries) => {
    expect(await inASentence(written)).toEqual([entries])
  })

  test.each([
    ['secreted', 'secret'],
    ['incoming', 'income']
  ])('「%s」 is not %s, which no entry has as a verb', async written => {
    expect(await inASentence(written)).toEqual([])
  })

  test('a past or -ing form that lists nothing still counts as a word of the sentence', async () => {
    expect(candidates(await search.search('rabbit incoming'))).toEqual([['兎']])
    expect(candidates(await search.search('rabbit xyzzying'))).toEqual([])
  })

  test.each([
    ['taller', ['高い']],
    ['tallest', ['高い']],
    ['colder', ['寒い']],
    ['bigger', ['大きい']],
    ['heavier', ['重い']],
    ['cuter', ['可愛い']],
    ['worse', ['悪い']],
    ['better', ['良い']]
  ])('the comparative 「%s」 brings its adjective, %o', async (written, entries) => {
    expect(await inASentence(written)).toEqual([entries])
  })

  test('a comparative with an entry of its own keeps it: 「best」 is not 「good」', async () => {
    expect(await inASentence('best')).toEqual([['最高']])
  })

  test('「peter」 is no comparative: 「pet」 would double its consonant', async () => {
    expect(await inASentence('peter')).toEqual([])
  })
})
