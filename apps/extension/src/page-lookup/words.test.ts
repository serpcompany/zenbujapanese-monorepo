import { describe, expect, it } from 'vitest'
import { sentence, sentenceTokens } from '../test/word-cards'
import { chunks, hasJapanese } from './chunks'
import { pageTokens, wordGroups } from './words'

describe('pageTokens', () => {
  it('places each token at its offset in the page text, with its ids and furigana in hiragana', () => {
    const placed = pageTokens(sentenceTokens, sentence, 10)
    expect(placed?.map(({ start, end, text, ids }) => ({ start, end, text, ids }))).toEqual([
      { start: 10, end: 12, text: '要求', ids: ['youkyuu'] },
      { start: 12, end: 13, text: 'が', ids: [] },
      { start: 13, end: 15, text: '要る', ids: ['iru'] },
      { start: 15, end: 16, text: '。', ids: [] }
    ])
    expect(placed?.[0].ruby).toEqual([{ text: '要求', reading: 'ようきゅう' }])
    expect(placed?.[2].ruby).toEqual([{ text: '要', reading: 'い' }, { text: 'る' }])
    expect(placed?.[1].ruby).toEqual([{ text: 'が' }])
  })

  it('offers every candidate of a word that has several', () => {
    const placed = pageTokens([{ text: '要', candidates: ['kaname', 'you'] }], '要')
    expect(placed?.[0].ids).toEqual(['kaname', 'you'])
  })

  it('offers the word the sentence links first, then the others written the same way', () => {
    const placed = pageTokens(
      [{ text: '要', reading: 'よう', languageReferenceID: 'you', writtenAlike: ['kaname'] }],
      '要'
    )
    expect(placed?.map(({ ids, linked }) => ({ ids, linked }))).toEqual([
      { ids: ['you', 'kaname'], linked: 'you' }
    ])
  })

  it('links no one word when the sentence leaves several candidates', () => {
    const placed = pageTokens([{ text: '要', candidates: ['kaname', 'you'] }], '要')
    expect(placed?.[0].linked).toBeNull()
  })

  it('keeps a reading that isn’t kana off the word', () => {
    const placed = pageTokens([{ text: '要', reading: '*', languageReferenceID: 'you' }], '要')
    expect(placed?.[0].ruby).toEqual([{ text: '要' }])
  })

  it('answers null when the tokens don’t spell the text', () => {
    expect(pageTokens(sentenceTokens, '要求が要らない。')).toBeNull()
    expect(pageTokens(sentenceTokens.slice(0, 2), sentence)).toBeNull()
    expect(pageTokens([{ text: '' }], '')).toBeNull()
  })
})

describe('wordGroups', () => {
  it('keeps punctuation with the word it belongs to', () => {
    const tokens = pageTokens(
      [{ text: '「' }, { text: '要求' }, { text: '」' }, { text: 'が' }, { text: '。' }],
      '「要求」が。'
    )
    expect(wordGroups(tokens ?? []).map(group => group.map(token => token.text))).toEqual([
      ['「', '要求', '」'],
      ['が', '。']
    ])
  })
})

describe('chunks', () => {
  it('cuts text at sentence ends, keeps each start, and drops chunks with no Japanese', () => {
    expect(chunks('要求が要る。OK! 要る？', 4)).toEqual([
      { start: 0, text: '要求が要' },
      { start: 4, text: 'る。' },
      { start: 9, text: ' 要る？' }
    ])
  })

  it('joins short sentences up to the limit', () => {
    expect(chunks('要る。要る。要る。', 6)).toEqual([
      { start: 0, text: '要る。要る。' },
      { start: 6, text: '要る。' }
    ])
  })

  it('counts code points, so a long word outside the basic plane isn’t cut in half', () => {
    const found = chunks('𠮟𠮟𠮟', 2)
    expect(found.map(chunk => chunk.text)).toEqual(['𠮟𠮟', '𠮟'])
    expect(found[1].start).toBe(4)
  })

  it('knows Japanese by its scripts', () => {
    expect(hasJapanese('Tokyo 2026')).toBe(false)
    expect(hasJapanese('カタカナ')).toBe(true)
  })
})
