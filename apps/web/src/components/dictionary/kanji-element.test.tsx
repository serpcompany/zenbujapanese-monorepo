import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import {
  appSectionTitles,
  kanjiElementDetail,
  linkKanjiElement,
  sectionTitle
} from '@/lib/dictionary/detail/element'
import { kanjiDetail } from '@/lib/dictionary/detail/kanji'
import type { KanjiElementRows } from '@/lib/dictionary/detail/rows'
import { dictionaryDatabase } from '@/lib/dictionary/dictionary-db'
import { kanjiElementPath, kanjiPath } from '@/lib/dictionary/urls'
import { KanjiElementContent } from './kanji-element'
import { KanjiElementsSection } from './kanji-elements'
import { readKanjiElement, readKanjiElements } from './rendered-element'

// Renders the kanji element page and a kanji page's Elements to HTML, as the server does, and
// reads back what a reader sees: the glyph and its meanings, each section in order, the texts, each
// kanji's row and link, the alternative forms' links, and the sources; and on the kanji page, each
// element's role, what it shows, and its link to the element page. The first tests render fixed
// data (kanji-page.test.tsx renders the fixtures); the last run every kanji-element-detail.json
// case, and every kanji-detail.json case's
// Elements, through the dictionary database and the detail core into the components
// (ZENBU_DICTIONARY_D1=1, part of the dictionary import's gate).

const draw = (rows: KanjiElementRows, kanjiPages: Set<string>) =>
  readKanjiElement(
    renderToStaticMarkup(
      <KanjiElementContent
        element={linkKanjiElement(kanjiElementDetail(rows), character =>
          kanjiPages.has(character) ? kanjiPath(character) : null
        )}
      />
    )
  )

describe('the element page', () => {
  test('an element with alternative forms links each to its own element page', () => {
    const page = draw(
      {
        element: {
          glyph: '万',
          alternatives: ['萬'],
          meanings: ['ten thousand'],
          onReadings: [],
          commonLinkedOnReadings: [],
          containingCharacters: ['万', '栃']
        },
        kanji: [
          { character: '万', meanings: ['ten thousand'], onReadings: ['マン'], frequencyRank: 375 },
          {
            character: '萬',
            meanings: ['ten thousand'],
            onReadings: ['マン'],
            frequencyRank: null
          },
          { character: '栃', meanings: ['horse chestnut'], onReadings: [], frequencyRank: 1000 }
        ],
        sources: {
          snapshot: 's',
          structureSourceIdentity: 'kanjium',
          metadataSourceIdentity: 'edrdg.kanjidic2',
          metadataSourceSnapshot: 'd'
        }
      },
      new Set(['万', '栃'])
    )
    expect(page.sections).toEqual([
      'Alternative forms',
      'Meaning / structure',
      'As a standalone kanji',
      'Kanji containing this element',
      'Source'
    ])
    expect(page.alternatives).toEqual([{ glyph: '萬', href: '/dictionary/elements/萬/' }])
    // The ranked form is the standalone kanji, and the list leaves it out.
    expect(page.standaloneKanji).toEqual({
      character: '万',
      meanings: 'ten thousand',
      readings: 'マン',
      href: '/dictionary/kanji/万/'
    })
    expect(page.containingKanji.map(row => row.character)).toEqual(['栃'])
    expect(page.containingKanji[0]).not.toHaveProperty('readings')
  })

  test('each section title is the app’s, in sentence case', () => {
    expect(sectionTitle(appSectionTitles.containingKanji)).toBe('Kanji containing this element')
    expect(sectionTitle(appSectionTitles.meaningStructure)).toBe('Meaning / structure')
  })
})

const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

interface ElementKanjiCase {
  character: string
  meanings?: string
  readings?: string
}

interface ElementCase {
  element: string
  covers: string
  opensDetail: boolean
  found?: boolean
  meanings?: string
  sections?: string[]
  alternatives?: string[]
  meaningExplanation?: string
  soundPatterns?: string
  standaloneKanji?: ElementKanjiCase
  containingKanji?: ElementKanjiCase[]
  structureSource?: string
  metadataSource?: string
  sourceNote?: string
}

interface KanjiCase {
  character: string
  covers: string
  opensDetail: boolean
  elements?: { glyph: string; meanings: string[]; linkedOnReadings?: string[]; role: string }[]
}

function suite<Case>(name: string): Case[] {
  if (!enabled) return []
  return (
    JSON.parse(
      readFileSync(
        new URL(`../../../../ios/LanguageData/Conformance/${name}.json`, import.meta.url),
        'utf8'
      )
    ) as { cases: Case[] }
  ).cases
}

const elementCases = suite<ElementCase>('kanji-element-detail')
const kanjiCases = suite<KanjiCase>('kanji-detail')

const roleLabels: Record<string, string> = {
  meaningStructure: 'Meaning / structure',
  sound: 'Sound',
  soundPattern: 'Sound pattern'
}

describe.runIf(enabled)('the rendered element page matches the app', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let dictionary: ReturnType<typeof dictionaryDatabase>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_DICTIONARY_D1_PATH ?? '.dictionary-d1'}/v3` }
    })
    if (!proxy.env.DICTIONARY_DB)
      throw new Error('wrangler.jsonc has no local DICTIONARY_DB binding')
    dictionary = dictionaryDatabase(proxy.env.DICTIONARY_DB)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test.each(elementCases)('element $element: $covers', async expected => {
    const found = await dictionary.element(expected.element)
    if (!expected.found) {
      // No page: the route answers 404.
      expect(found).toBeNull()
      return
    }
    if (!found) throw new Error(`No element ${expected.element}`)
    const page = readKanjiElement(
      renderToStaticMarkup(
        <KanjiElementContent
          element={linkKanjiElement(kanjiElementDetail(found.rows), character =>
            found.kanjiPages.has(character) ? kanjiPath(character) : null
          )}
        />
      )
    )
    const row = (kanji: ElementKanjiCase) => ({
      ...kanji,
      // The app opens every kanji's Kanji Detail; each has a page.
      href: kanjiPath(kanji.character)
    })
    expect(page).toEqual({
      glyph: expected.element,
      meanings: expected.meanings ?? null,
      sections: (expected.sections ?? []).map(sectionTitle),
      alternatives: (expected.alternatives ?? []).map(glyph => ({
        glyph,
        href: kanjiElementPath(glyph)
      })),
      meaningExplanation: expected.meaningExplanation ?? null,
      soundPatterns: expected.soundPatterns ?? null,
      standaloneKanji: expected.standaloneKanji ? row(expected.standaloneKanji) : null,
      containingKanji: (expected.containingKanji ?? []).map(row),
      structureSource: expected.structureSource,
      metadataSource: expected.metadataSource,
      sourceNote: expected.sourceNote
    })
  })

  test.each(
    kanjiCases.filter(kanji => kanji.opensDetail)
  )('kanji $character’s Elements: $covers', async expected => {
    const found = await dictionary.kanji(expected.character)
    if (!found) throw new Error(`No kanji ${expected.character}`)
    const drawn = readKanjiElements(
      renderToStaticMarkup(<KanjiElementsSection elements={kanjiDetail(found.rows).elements} />)
    )
    // Each element opens its element page, as the app's row opens its element screen.
    expect(drawn).toEqual(
      (expected.elements ?? []).map(element => ({
        glyph: element.glyph,
        role: roleLabels[element.role],
        description:
          element.meanings.length > 0
            ? element.meanings.join(', ')
            : `Linked on-readings: ${(element.linkedOnReadings ?? []).join(', ')}`,
        href: kanjiElementPath(element.glyph)
      }))
    )
  })
})
