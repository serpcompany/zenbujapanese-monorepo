import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import { fixtureKanjiRows } from '@zenbu/dictionary-core/fixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { KanjiDetailsData } from '@/lib/dictionary/data'
import { KanjiDetails } from './kanji-details'
import { visibleText } from './rendered'

function details(): KanjiDetailsData {
  const kanameRows = fixtureKanjiRows.find(rows => rows.kanji.character === '要')
  if (!kanameRows) throw new Error('No fixture for 要')
  const detail = kanjiDetail(kanameRows)
  const unlinked = <T,>(item: T) => ({ ...item, path: null })
  return {
    ...detail,
    readings: detail.readings.map(reading => ({ ...reading, words: reading.words.map(unlinked) })),
    components: detail.components.map(character => unlinked({ character })),
    elements: detail.elements.map(unlinked),
    words: detail.words.map(unlinked)
  }
}

const html = renderToStaticMarkup(<KanjiDetails kanji={details()} />)

describe("a kanji's details offer what the app's Kanji Detail has beside them", () => {
  test('Share and More actions, named for the kanji', () => {
    expect(html).toContain('aria-label="Share 要"')
    expect(html).toContain('aria-label="More actions for 要"')
  })

  test("Lists and Notes come after the elements and before the words, in the app's order", () => {
    const parts = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(([, title]) => title)
    expect(parts).toEqual(['Readings', 'Elements', 'Lists', 'Notes', 'Words'])
  })

  test('Lists and Notes offer the app, as on a word page', () => {
    const part = (title: string) =>
      visibleText(html.match(new RegExp(`<h3[^>]*>${title}</h3>([\\s\\S]*?)</section>`))?.[1] ?? '')
    expect(part('Lists')).toBe('Add to List Save it to your lists in the Zenbu app. Add to List')
    expect(part('Notes')).toBe('Add Note Write notes and attach photos in the Zenbu app. Add Note')
  })
})
