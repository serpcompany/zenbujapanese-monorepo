import { KanjiDetails } from '@zenbu/ui/dictionary/kanji-details'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { SavedItem } from '@/lib/account/saved-item'
import { kanjiDetailsIn } from '@/lib/dictionary/screen-text'
import { fixtureKanji, unlinkedKanjiDetails } from '@/test/kanji-details'
import { visibleText } from '@/test/rendered'
import { kanjiActionsIn, kanjiDetailsProps, kanjiLearnerPromptIn } from './kanji-props'

const kaname = unlinkedKanjiDetails(fixtureKanji('要'))

const html = renderToStaticMarkup(<KanjiDetails {...kanjiDetailsProps(kaname, 'en')} />)

describe("a kanji's details offer what the app's Kanji Detail has beside them", () => {
  test('Share and More actions, named for the kanji', () => {
    expect(html).toContain('aria-label="Share 要"')
    expect(html).toContain('aria-label="More actions for 要"')
  })

  test("Lists and Notes come after the elements and before the words, in the app's order", () => {
    const parts = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(([, title]) => title)
    expect(parts).toEqual(['Readings', 'Elements', 'Lists', 'Notes', 'Words'])
  })

  test("Lists and Notes offer the app's actions, as on a word page", () => {
    const part = (title: string) =>
      visibleText(html.match(new RegExp(`<h3[^>]*>${title}</h3>([\\s\\S]*?)</section>`))?.[1] ?? '')
    expect(part('Lists')).toBe('Add to List Save it to your lists in the Zenbu app. Add to List')
    expect(part('Notes')).toBe('Add Note Write notes and attach photos in the Zenbu app. Add Note')
  })
})

test("a kanji's More actions, Lists, and Notes save to the kanji itself, on a word page too", () => {
  const shown = kanjiDetailsIn(kaname, 'en')
  const savedTo = (element: unknown) => (element as ReactElement<{ item: SavedItem }>).props.item
  const kanji = { id: 'kanji:要', headword: '要', reading: 'ヨウ' }
  expect(savedTo(kanjiActionsIn('en')(shown))).toEqual(kanji)
  expect(savedTo(kanjiLearnerPromptIn('en')(shown)('lists'))).toEqual(kanji)
  expect(savedTo(kanjiDetailsProps(kaname, 'en').learnerPrompt('notes'))).toEqual(kanji)
})

describe("a kanji's details on a Japanese page", () => {
  const japanese = renderToStaticMarkup(<KanjiDetails {...kanjiDetailsProps(kaname, 'ja')} />)

  test('name their parts, stats, and actions in Japanese', () => {
    const parts = [...japanese.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(([, title]) => title)
    expect(parts).toEqual(['読み方', '構成要素', 'リスト', 'メモ', '単語'])
    expect(japanese).toContain('aria-label="要を共有"')
    expect(japanese).toContain('aria-label="要のその他の操作"')
    expect(japanese).toContain('aria-label="要の書き順を見る"')
    expect(japanese).toContain('<dt class="text-xs text-muted-foreground">画数</dt>')
  })

  test("keep KANJIDIC2's English meanings, marked as English", () => {
    expect(japanese).toContain(
      '<p class="text-lg font-medium" lang="en">need, main point, essence, pivot, key to</p>'
    )
  })
})
