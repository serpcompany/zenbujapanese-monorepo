import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { fixtureKanji, unlinkedKanjiDetails } from '@/test/kanji-details'
import { visibleText } from '@/test/rendered'
import { KanjiDetails } from './kanji-details'

const html = renderToStaticMarkup(<KanjiDetails kanji={unlinkedKanjiDetails(fixtureKanji('要'))} />)

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
