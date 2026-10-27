import { describe, expect, test } from 'vitest'
import {
  fill,
  graphemeCount,
  graphemes,
  isCJKUnifiedIdeograph,
  isKanjiCharacter,
  scalarCount,
  shortGloss,
  templateParts
} from './text'

const character = (code: number) => String.fromCharCode(code)

const unitsCountedWithoutSegmenting = [
  [0x20, 0x7e],
  [0x3000, 0x3029],
  [0x3030, 0x3098],
  [0x309b, 0x30ff],
  [0x4e00, 0x9fff],
  [0xff00, 0xff9d],
  [0xffa0, 0xffef]
].flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, index) => from + index))

describe('graphemeCount', () => {
  test('counts as the segmenter does wherever it skips it: no such unit joins a neighbor', () => {
    const joined = unitsCountedWithoutSegmenting.filter(code => {
      const unit = character(code)
      return (
        graphemes(unit + unit).length !== 2 ||
        graphemes(`あ${unit}`).length !== 2 ||
        graphemes(`${unit}あ`).length !== 2
      )
    })
    expect(joined).toEqual([])
  })

  test('is each unit of such text, whatever stands beside it', () => {
    const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
    const neighbors = ['a', ' ', 'あ', 'ア', '日', 'Ａ', '、', 'ｱ']
    const joined = unitsCountedWithoutSegmenting.filter(code =>
      neighbors.some(
        neighbor =>
          Array.from(segmenter.segment(`${neighbor}${character(code)}${neighbor}`)).length !== 3
      )
    )
    expect(joined).toEqual([])
    expect(graphemes('私はAを食べた。')).toEqual(['私', 'は', 'A', 'を', '食', 'べ', 'た', '。'])
    expect(graphemes('')).toEqual([])
  })

  test('segments anything else: a combining mark, CR LF, or a flag joins its neighbor', () => {
    expect(graphemeCount(`か${character(0x3099)}`)).toBe(1)
    expect(graphemeCount(`ﾀ${character(0xff9e)}`)).toBe(1)
    expect(graphemeCount('a\r\nb')).toBe(3)
    expect(graphemeCount(String.fromCodePoint(0x1f1ef, 0x1f1f5))).toBe(1)
  })

  test('counts plain Japanese and ASCII by their length', () => {
    expect(graphemeCount('私は毎日日本語を勉強します。')).toBe(14)
    expect(graphemeCount('I study Japanese every day.')).toBe(27)
    expect(graphemeCount('')).toBe(0)
  })
})

describe('scalarCount', () => {
  test('counts a pair of surrogates once, and a surrogate alone once', () => {
    expect(scalarCount('')).toBe(0)
    expect(scalarCount('日本語 abc')).toBe(7)
    expect(scalarCount('𠀋が😀')).toBe(3)
    expect(scalarCount(`${character(0xd83d)}a${character(0xde00)}`)).toBe(3)
    expect(scalarCount(`😀${character(0xd83d)}`)).toBe(2)
  })
})

describe('isKanjiCharacter', () => {
  const compatibility = character(0xf900)

  test('is one character, in the ideograph blocks', () => {
    expect(['見', '㐀', compatibility, '𠀋'].map(isKanjiCharacter)).toEqual([
      true,
      true,
      true,
      true
    ])
    expect(
      ['', '見る', '見見', 'み', '々', 'a', character(0xd840), '😀'].map(isKanjiCharacter)
    ).toEqual([false, false, false, false, false, false, false, false])
  })

  test('a word has an ideograph when any of its characters is in the main blocks', () => {
    expect(['見る', 'お茶', '㐀'].map(isCJKUnifiedIdeograph)).toEqual([true, true, true])
    expect(['みる', '', '々', '𠀋', compatibility].map(isCJKUnifiedIdeograph)).toEqual([
      false,
      false,
      false,
      false,
      false
    ])
  })
})

describe('shortGloss', () => {
  test('is a meaning’s first part, without a note in brackets or a leading “to”', () => {
    expect(shortGloss('husband')).toBe('husband')
    expect(shortGloss('to wipe, to dry')).toBe('wipe')
    expect(shortGloss('brothers and sisters, siblings')).toBe('brothers and sist…')
    expect(shortGloss('to fold (clothes, etc.), to shut')).toBe('fold')
    expect(shortGloss('(the) above, over, up')).toBe('above')
  })

  test('cuts a long gloss to seventeen characters and an ellipsis', () => {
    const gloss = shortGloss('from the standpoint of, on')
    expect(gloss).toBe('from the standpoi…')
    expect(graphemes(gloss ?? '')).toHaveLength(18)
    expect(shortGloss('exactly eighteen ch')).toBe('exactly eighteen …')
    expect(shortGloss('eighteen in all 18')).toBe('eighteen in all 18')
  })

  test('skips an empty part before the first comma, and is nothing when nothing is left', () => {
    expect(shortGloss(', spare')).toBe('spare')
    expect(shortGloss('(note only)')).toBeNull()
    expect(shortGloss('to ')).toBe('to')
    expect(shortGloss('')).toBeNull()
  })
})

describe('templates', () => {
  test('fill puts values into a whole sentence and leaves unknown placeholders alone', () => {
    expect(fill('Updated {date}', { date: 'today' })).toBe('Updated today')
    expect(fill('{count} of {total}', { count: 1, total: 3 })).toBe('1 of 3')
    expect(fill('{missing} stays', {})).toBe('{missing} stays')
  })

  test('templateParts splits a template at its placeholders', () => {
    expect(templateParts('Email {address} today.')).toEqual([
      { text: 'Email ' },
      { text: '{address}', name: 'address' },
      { text: ' today.' }
    ])
  })
})
