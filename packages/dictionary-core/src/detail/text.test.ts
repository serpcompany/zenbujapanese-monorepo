import { describe, expect, test } from 'vitest'
import { graphemeCount, graphemes } from './text'

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
