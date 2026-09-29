import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { kanjiElementDetail, linkKanjiElement } from '@/lib/dictionary/detail/element'
import { kanjiDetail } from '@/lib/dictionary/detail/kanji'
import { fixtureElementRows, fixtureKanjiRows } from '@/lib/dictionary/fixtures'
import { kanjiPath } from '@/lib/dictionary/urls'
import { KanjiElementContent } from './kanji-element'
import { KanjiElementsSection } from './kanji-elements'
import { readKanjiElement, readKanjiElements } from './rendered-element'

// The kanji 要's Elements and the element page of 女, rendered from the local fixtures as the
// server renders them. The dictionary import's gate draws every app-recorded case the same way
// (kanji-element.test.tsx).

describe('the element page', () => {
  test('shows 女: its meanings, sections in the app’s order, and every kanji containing it', () => {
    const onna = fixtureElementRows.find(rows => rows.element.glyph === '女')
    if (!onna) throw new Error('No fixture for 女')
    const page = readKanjiElement(
      renderToStaticMarkup(
        <KanjiElementContent
          element={linkKanjiElement(kanjiElementDetail(onna), character =>
            character === '要' ? kanjiPath(character) : null
          )}
        />
      )
    )
    expect(page.glyph).toBe('女')
    expect(page.meanings).toBe('woman, female')
    expect(page.sections).toEqual([
      'Meaning / structure',
      'Sound patterns',
      'Kanji containing this element',
      'Source'
    ])
    expect(page.meaningExplanation).toBe(
      'This element contributes forms associated with woman, female.'
    )
    expect(page.soundPatterns).toBe('Linked on-readings: ジョウ, エン, ヨウ, オウ')
    expect(page.standaloneKanji).toBeNull()
    expect(page.containingKanji[0]).toEqual({
      character: '要',
      meanings: 'need, main point, essence',
      readings: 'ヨウ',
      href: '/dictionary/kanji/要/'
    })
    // A kanji without a page shows without a link.
    expect(page.containingKanji[1].href).toBeNull()
    expect(page.containingKanji).toHaveLength(onna.element.containingCharacters.length)
    expect(page.structureSource).toMatch(/^kanjium [0-9a-f]{40}$/)
    expect(page.metadataSource).toMatch(/^edrdg\.kanjidic2 \d{4}-\d{2}-\d{2}$/)
  })
})

describe('the kanji page’s Elements', () => {
  test('each element shows its role and meanings, and opens its element page', () => {
    const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要')
    if (!kaname) throw new Error('No fixture for 要')
    const drawn = readKanjiElements(
      renderToStaticMarkup(<KanjiElementsSection elements={kanjiDetail(kaname).elements} />)
    )
    expect(drawn.map(({ glyph, href }) => [glyph, href])).toEqual([
      ['女', '/dictionary/elements/女/'],
      ['覀', '/dictionary/elements/覀/']
    ])
    // 女 shares ヨウ with 要, so it's a sound pattern.
    expect(drawn[0]).toMatchObject({ role: 'Sound pattern', description: 'woman, female' })
  })
})
