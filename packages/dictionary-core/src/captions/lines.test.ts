import { describe, expect, test } from 'vitest'
import { japaneseCaptions, type TimedLine, translationSentences } from './lines'

const line = (start: number, end: number, text: string): TimedLine => ({ start, end, text })

describe('japaneseCaptions (YouTubeCaptionParsing.cues)', () => {
  test('joins a line’s rows without a space, trims each row, and drops empty rows', () => {
    const captions = japaneseCaptions([
      line(0, 2, '\u3000これは猫の\u00a0\n\r\n\t写真です。 '),
      line(2, 4, 'はい\u2028そうです')
    ])
    expect(captions.map(caption => caption.text)).toEqual(['これは猫の写真です。', 'はいそうです'])
  })

  test('drops sound tags in either kind of bracket, and lines that held only a tag', () => {
    const captions = japaneseCaptions([
      line(11, 15, '[音楽]'),
      line(17, 20, '[音楽] 私のことを'),
      line(20, 23, '［拍手］'),
      line(23, 25, '[Music] Do'),
      line(25, 27, '前 [笑] 後')
    ])
    expect(captions.map(caption => caption.text)).toEqual(['私のことを', 'Do', '前 後'])
  })

  test('ends each line at the next line’s start, even a dropped one, and never before its own', () => {
    const captions = japaneseCaptions([
      line(0.5, 4.5, '一'),
      line(3, 5.5, '二'),
      line(6, 7, ' '),
      line(7.25, 9.25, '三'),
      line(10, 12, '四'),
      line(9, 10, '五')
    ])
    expect(captions.map(({ id, start, end }) => [id, start, end])).toEqual([
      [0, 0.5, 3],
      [1, 3, 5.5],
      [2, 7.25, 9.25],
      [3, 10, 10],
      [4, 9, 10]
    ])
    expect(captions.every(caption => caption.translation === null)).toBe(true)
  })
})

describe('translationSentences (YouTubeCaptionParsing.translationSentences)', () => {
  test('joins a line’s rows with a space and drops sound tags', () => {
    const sentences = translationSentences([line(0, 2, 'This is\na picture [Music]')])
    expect(sentences.map(sentence => sentence.text)).toEqual(['This is a picture'])
  })

  test('empty slots extend the sentence that follows them back to their start', () => {
    const sentences = translationSentences([
      line(17.21, 37.89, '[Music] Do'),
      line(40.76, 49.039, ''),
      line(44.399, 53.44, ''),
      line(53.44, 62.199, "n't mess with the program of love"),
      line(60.57, 64.76, '[Music]'),
      line(64.76, 69.96, 'Put it on top')
    ])
    expect(sentences.map(({ id, start, end, text }) => [id, start, end, text])).toEqual([
      [0, 40.76, 62.199, "Don't mess with the program of love"],
      [1, 60.57, 69.96, 'Put it on top']
    ])
  })

  test('a line starting with an apostrophe joins the sentence before it', () => {
    const sentences = translationSentences([line(0, 1, 'It'), line(1, 2, "'s fine")])
    expect(sentences).toEqual([{ id: 0, start: 1, end: 2, text: "It's fine", translation: null }])
  })
})
