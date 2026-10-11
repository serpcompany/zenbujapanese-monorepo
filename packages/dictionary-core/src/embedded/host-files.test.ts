import { describe, expect, test } from 'vitest'
import { ask } from './fake-host'

describe('what the embedded core decodes from a file its host reads', () => {
  test('decodes a kanji’s strokes into the points to draw, and refuses a broken diagram', async () => {
    const row = { viewportSize: 109, strokeCount: 1, strokes: [[0, 1, 2, 1, 3, 4, 5, 6, 7, 8]] }
    expect(await ask({}, 'kanjiStrokes', JSON.stringify(row))).toEqual({
      viewportSize: 109,
      strokes: [
        [
          { end: { x: 1, y: 2 }, controls: null },
          {
            end: { x: 7, y: 8 },
            controls: [
              { x: 3, y: 4 },
              { x: 5, y: 6 }
            ]
          }
        ]
      ]
    })
    await expect(
      ask({}, 'kanjiStrokes', JSON.stringify({ ...row, strokeCount: 2 }))
    ).rejects.toThrow('stroke-count mismatch')
  })

  test('lists the kanji a set of radicals builds, from the radical file the host reads', async () => {
    const radicals = () => ({
      sourceIdentity: 'edrdg.kradfile',
      components: [
        { id: '一', glyph: '一', strokeCount: 1 },
        { id: '木', glyph: '木', strokeCount: 4 }
      ],
      characters: [
        { value: '本', components: ['一', '木'] },
        { value: '一', components: ['一'] }
      ]
    })
    expect(await ask({ radicals }, 'radicalPanel', JSON.stringify(['一']))).toEqual({
      candidates: ['一', '本'],
      groups: [
        { strokeCount: 1, label: '1 Stroke', radicals: [{ id: '一', glyph: '一' }] },
        { strokeCount: 4, label: '4 Strokes', radicals: [{ id: '木', glyph: '木' }] }
      ]
    })
    await expect(ask({}, 'radicalPanel', '[]')).rejects.toThrow(
      'The host has no radical file to read'
    )
  })
})
