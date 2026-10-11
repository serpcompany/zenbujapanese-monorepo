import { describe, expect, test } from 'vitest'
import { checkedRadicalFile, RadicalLookup } from './radicals'

const lookup = new RadicalLookup({
  components: [
    { id: '一', glyph: '一', strokeCount: 1 },
    { id: '｜', glyph: '丨', strokeCount: 1 },
    { id: '口', glyph: '口', strokeCount: 3 },
    { id: '日', glyph: '日', strokeCount: 4 },
    { id: '木', glyph: '木', strokeCount: 4 }
  ],
  characters: [
    { value: '東', components: ['一', '｜', '日', '木'] },
    { value: '十', components: ['一', '｜'] },
    { value: '中', components: ['｜', '口'] },
    { value: '本', components: ['一', '木'] },
    { value: '一', components: ['一'] },
    { value: '日', components: ['日'] }
  ]
})

describe('checkedRadicalFile', () => {
  const file = {
    sourceIdentity: 'edrdg.kradfile',
    components: [{ id: '一', glyph: '一', strokeCount: 1 }],
    characters: [{ value: '一', components: ['一'] }]
  }

  test('takes the radicals and kanji of the file the core reads', () => {
    expect(checkedRadicalFile({ ...file, snapshot: '2026-08-10' })).toEqual({
      components: file.components,
      characters: file.characters
    })
  })

  test.each([
    ['from another source', { ...file, sourceIdentity: 'other' }, 'sourceIdentity is other'],
    ['with no source', null, 'sourceIdentity is undefined'],
    ['without its kanji', { ...file, characters: undefined }, 'does not list radicals'],
    [
      'whose kanji name their radicals another way',
      { ...file, characters: [{ value: '一', components: [{ id: '一' }] }] },
      'does not list radicals'
    ],
    [
      'whose radical has no stroke count',
      { ...file, components: [{ id: '一', glyph: '一' }] },
      'does not list radicals'
    ]
  ])('refuses a file %s', (_, read, message) => {
    expect(() => checkedRadicalFile(read)).toThrow(message)
  })
})

describe('RadicalLookup', () => {
  test('with nothing selected, lists every radical by stroke count and no kanji', () => {
    expect(lookup.panel([])).toEqual({
      candidates: [],
      groups: [
        {
          strokeCount: 1,
          label: '1 Stroke',
          radicals: [
            { id: '一', glyph: '一' },
            { id: '｜', glyph: '丨' }
          ]
        },
        { strokeCount: 3, label: '3 Strokes', radicals: [{ id: '口', glyph: '口' }] },
        {
          strokeCount: 4,
          label: '4 Strokes',
          radicals: [
            { id: '日', glyph: '日' },
            { id: '木', glyph: '木' }
          ]
        }
      ]
    })
  })

  test('lists the kanji holding every selected radical, fewest other radicals first', () => {
    expect(lookup.panel(['一']).candidates).toEqual(['一', '十', '本', '東'])
    expect(lookup.panel(['一', '｜']).candidates).toEqual(['十', '東'])
    expect(lookup.panel(['｜', '一', '｜']).candidates).toEqual(['十', '東'])
  })

  test('keeps only the radicals those kanji hold', () => {
    expect(
      lookup.panel(['一', '｜']).groups.map(group => group.radicals.map(({ id }) => id))
    ).toEqual([
      ['一', '｜'],
      ['日', '木']
    ])
  })

  test('shows every radical again when no kanji holds the selection', () => {
    const panel = lookup.panel(['口', '木'])
    expect(panel.candidates).toEqual([])
    expect(panel.groups.flatMap(group => group.radicals)).toHaveLength(5)
  })
})
