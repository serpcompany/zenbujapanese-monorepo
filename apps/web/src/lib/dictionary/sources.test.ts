import { describe, expect, test } from 'vitest'
import { pageSources, type Source, sources, withShownData } from './sources'

const names = (list: readonly Source[]) => list.map(source => source.name)

const withoutStrokes = { strokeOrder: null, stats: [] }
const withStrokes = { strokeOrder: { strokes: [] }, stats: [] }
const withJlpt = { strokeOrder: null, stats: [{ label: 'Strokes' }, { label: 'JLPT' }] }

describe('withShownData, the credits for what a page shows', () => {
  test('adds nothing when the page shows no kanji details or search examples', () => {
    expect(withShownData(pageSources.search, { kanji: [] })).toEqual(pageSources.search)
    expect(withShownData(pageSources.word, { kanji: [], examples: false })).toEqual(
      pageSources.word
    )
  })

  test('credits kanji details with their radical and structure data, after the page’s own', () => {
    expect(names(withShownData(pageSources.search, { kanji: [withoutStrokes] }))).toEqual([
      'JMdict',
      'KANJIDIC2',
      'JLPT levels',
      'TUBELEX',
      'RADKFILE',
      'Kanjium'
    ])
  })

  test('credits Waller’s JLPT kanji lists only when a shown kanji has a JLPT level', () => {
    expect(names(withShownData(pageSources.search, { kanji: [withJlpt, withoutStrokes] }))).toEqual(
      ['JMdict', 'KANJIDIC2', 'JLPT levels', 'TUBELEX', 'RADKFILE', 'Kanjium', 'JLPT kanji levels']
    )
  })

  test('credits KanjiVG only when a shown kanji draws its stroke order', () => {
    expect(
      names(withShownData(pageSources.word, { kanji: [withoutStrokes, withStrokes] }))
    ).toEqual([
      'JMdict',
      'UniDic',
      'KANJIDIC2',
      'JLPT levels',
      'TUBELEX',
      'Tatoeba',
      'RADKFILE',
      'KanjiVG',
      'Kanjium'
    ])
  })

  test('credits Tatoeba for a search’s examples, once', () => {
    expect(names(withShownData(pageSources.search, { kanji: [], examples: true }))).toEqual([
      'JMdict',
      'KANJIDIC2',
      'JLPT levels',
      'TUBELEX',
      'Tatoeba'
    ])
    expect(
      withShownData(pageSources.word, { kanji: [], examples: true }).filter(
        source => source === sources.tatoeba
      )
    ).toHaveLength(1)
  })

  test('adds KANJIDIC2 when the page doesn’t credit it already, and changes no list', () => {
    const base = [sources.jmdict]
    expect(names(withShownData(base, { kanji: [withStrokes], examples: true }))).toEqual([
      'JMdict',
      'KANJIDIC2',
      'RADKFILE',
      'KanjiVG',
      'Kanjium',
      'Tatoeba'
    ])
    expect(base).toEqual([sources.jmdict])
  })
})
