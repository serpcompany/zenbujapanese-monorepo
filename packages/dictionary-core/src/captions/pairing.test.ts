import { describe, expect, test } from 'vitest'
import type { Caption } from './lines'
import { pairedCaptions } from './pairing'

const caption = (id: number, start: number, end: number, text: string): Caption => ({
  id,
  start,
  end,
  text,
  translation: null
})

const translations = (paired: Caption[]) => paired.map(card => card.translation)

describe('pairedCaptions (YouTubeCaptionParsing.pairing)', () => {
  test('translations attach to the Japanese line they start within', () => {
    const japanese = [
      caption(0, 0, 4, 'これは猫の写真です。'),
      caption(1, 4, 8, '色々な猫の写真があります。'),
      caption(2, 8, 9, 'はい。')
    ]
    const english = [
      caption(0, 0, 2, 'This is a picture'),
      caption(1, 2, 4, 'of a cat.'),
      caption(2, 4.1, 8, 'There are various pictures of cats.')
    ]
    expect(translations(pairedCaptions(japanese, english))).toEqual([
      'This is a picture of a cat.',
      'There are various pictures of cats.',
      null
    ])
  })

  test('a translation spanning too many lines leaves them as separate cards', () => {
    const japanese = [
      caption(0, 40, 44, '突然のキス'),
      caption(1, 44, 49, 'や熱いまなざしで'),
      caption(2, 49, 53, '恋のプログラムを'),
      caption(3, 53, 60, '狂わせないでね'),
      caption(4, 60, 64, '出会いと別れ')
    ]
    const english = [
      caption(0, 40, 42, 'Do'),
      caption(1, 42, 60, "n't mess with the program of love."),
      caption(2, 60, 64, 'Meetings and partings')
    ]
    const paired = pairedCaptions(japanese, english)
    expect(paired.map(card => card.id)).toEqual([0, 1, 2, 3, 4])
    expect(translations(paired)).toEqual([
      'Do',
      null,
      null,
      "n't mess with the program of love.",
      'Meetings and partings'
    ])
  })

  test('a small timing overlap at the edge doesn’t join neighboring lines', () => {
    const paired = pairedCaptions(
      [caption(0, 0, 4, '一'), caption(1, 4, 8, '二')],
      [caption(0, 0, 4.2, 'One'), caption(1, 4.2, 8, 'Two')]
    )
    expect(translations(paired)).toEqual(['One', 'Two'])
  })

  test('a translation spanning two short lines merges them into one card', () => {
    const paired = pairedCaptions(
      [caption(0, 0, 2, '布巾で'), caption(1, 2, 4, '拭きます。'), caption(2, 4, 6, 'はい。')],
      [caption(0, 0, 4, "I'll wipe it with a cloth."), caption(1, 4, 6, 'Yes.')]
    )
    expect(paired).toEqual([
      {
        id: 0,
        start: 0,
        end: 4,
        text: '布巾で拭きます。',
        translation: "I'll wipe it with a cloth."
      },
      { id: 1, start: 4, end: 6, text: 'はい。', translation: 'Yes.' }
    ])
  })

  test('no card ever exceeds two lines or 40 characters, whatever the translations span', () => {
    const japanese = Array.from({ length: 12 }, (_, index) =>
      caption(index, index * 4, (index + 1) * 4, `愛さないで恋いなんてまた${index}`)
    )
    const spans = [
      [0, 12],
      [0, 3],
      [1, 2],
      [2, 9],
      [5, 6],
      [7, 8],
      [8, 12],
      [11, 12]
    ] as const
    for (const [from, to] of spans) {
      const paired = pairedCaptions(japanese, [caption(0, from * 4, to * 4, 'x')])
      expect(paired.map(card => card.text).join('')).toBe(japanese.map(line => line.text).join(''))
      for (const card of paired) {
        const lines = japanese.filter(line => line.start >= card.start && line.end <= card.end)
        expect(lines.length).toBeLessThanOrEqual(2)
        expect(lines.length === 1 || card.text.length <= 40).toBe(true)
      }
    }
  })

  test('joins a card’s translations with a space, except before punctuation or a contraction', () => {
    const paired = pairedCaptions(
      [caption(0, 0, 8, '布巾で拭きます。')],
      [
        caption(0, 0, 2, 'I'),
        caption(1, 2, 4, "'ll wipe"),
        caption(2, 4, 6, 'it'),
        caption(3, 6, 8, '.')
      ]
    )
    expect(translations(paired)).toEqual(["I'll wipe it."])
  })

  test('pairs lines given out of time order as it pairs lines in order', () => {
    const paired = pairedCaptions(
      [caption(0, 4, 8, '二'), caption(1, 0, 4, '一')],
      [caption(0, 0, 4, 'One'), caption(1, 4, 8, 'Two')]
    )
    expect(paired.map(card => [card.text, card.translation])).toEqual([
      ['二', 'Two'],
      ['一', 'One']
    ])
  })

  test('leaves the lines as they are when there are no translations', () => {
    const japanese = [caption(0, 0, 4, '一')]
    expect(pairedCaptions(japanese, [])).toEqual(japanese)
    expect(pairedCaptions([], [caption(0, 0, 4, 'One')])).toEqual([])
  })
})
