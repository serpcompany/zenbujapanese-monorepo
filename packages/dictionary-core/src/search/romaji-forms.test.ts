import { describe, expect, test } from 'vitest'
import { romajiQuery, romajiSearchForms } from './romaji-forms'

describe('romajiSearchForms', () => {
  test.each([
    ['ラーメン', 'raamen', 'rāmen', ['ramen']],
    ['きんえん', 'kinen', "kin'en", []],
    ['つづく', 'tsuzuku', 'tsudzuku', []],
    ['はなぢ', 'hanaji', 'hanadji', []],
    ['ファイル', 'fuiru', 'fairu', []],
    ['を', 'o', 'wo', []],
    ['コーヒー', 'koohii', 'kōhī', ['kohi']]
  ])('%s is searched by its ASCII spelling, %s, its romaji as the apps show it, %s, and that romaji without macrons', (reading, typed, shown, unmarkedRomaji) => {
    expect(romajiSearchForms([reading])).toEqual({
      romaji: [typed],
      shownRomaji: [shown],
      unmarkedRomaji
    })
  })

  test('a reading the apps show as it is typed has its ASCII spelling only', () => {
    expect(romajiSearchForms(['さくら'])).toEqual({
      romaji: ['sakura'],
      shownRomaji: [],
      unmarkedRomaji: []
    })
  })

  test.each([
    ['まっちゃ', 'maccha', 'matcha'],
    ['あっ', 'a', 'a~tsu'],
    ['チェック', 'chikku', 'chekku'],
    ['ティー', 'tee', 'tī'],
    ['ヴァイオリン', 'vuiorin', 'vu~aiorin'],
    ['こゝろ', 'koro', 'kokoro']
  ])('the ASCII spelling of %s is the one earlier releases searched, %s, beside %s', (reading, typed, shown) => {
    const forms = romajiSearchForms([reading])
    expect([forms.romaji, forms.shownRomaji]).toEqual([[typed], [shown]])
  })

  test('a reading with no ASCII spelling, such as ヶ, is still searched by its shown romaji', () => {
    expect(romajiSearchForms(['ヶ'])).toEqual({
      romaji: [],
      shownRomaji: ['~ke'],
      unmarkedRomaji: []
    })
  })

  test('a middle dot is a hyphen in the ASCII spelling and a space in the shown romaji', () => {
    expect(romajiSearchForms(['アーガイル・チェック'])).toEqual({
      romaji: ['aagairu-chikku'],
      shownRomaji: ['āgairu chekku'],
      unmarkedRomaji: ['agairu chekku']
    })
  })

  test('an entry lists each form once, and leaves out a shown or unmarked form another reading spells in ASCII', () => {
    expect(romajiSearchForms(['おばーさん', 'おばさん'])).toEqual({
      romaji: ['obaasan', 'obasan'],
      shownRomaji: ['obāsan'],
      unmarkedRomaji: []
    })
  })

  test('a reading with no romaji, such as a lone long mark, has no romaji forms', () => {
    expect(romajiSearchForms(['ー'])).toEqual({ romaji: [], shownRomaji: [], unmarkedRomaji: [] })
    expect(romajiSearchForms(['〜'])).toEqual({ romaji: [], shownRomaji: [], unmarkedRomaji: [] })
  })
})

describe('romajiQuery', () => {
  test.each([
    'raamen',
    "kin'en",
    'cat',
    '123',
    'a~tsu'
  ])('an ASCII query, %s, searches as it is', query => {
    expect(romajiQuery(query)).toBe(query)
  })

  test.each([
    ['rāmen', 'rāmen'],
    ['kōhī', 'kōhī'],
    ['āgairu・chekku', 'āgairu chekku'],
    ['inonakanokawazu、taikaiwoshirazu', 'inonakanokawazu taikaiwoshirazu'],
    ['e〜to', 'e to'],
    ['ē', 'ē']
  ])('romaji the apps show, %s, searches as romaji: %s', (query, searched) => {
    expect(romajiQuery(query)).toBe(searched)
  })

  test.each(['café', 'ラーメン', 'らーめん', '・', '〜', 'rāメン'])('%s isn’t romaji', query => {
    expect(romajiQuery(query)).toBeNull()
  })
})
