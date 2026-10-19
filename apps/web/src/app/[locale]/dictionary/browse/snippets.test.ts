import { allRankBands, rankBand, rankedLists } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { describe, expect, test, vi } from 'vitest'
import { rankBandTitle } from '@/lib/dictionary/browse/copy'
import { rankPageRanks, rankPagesPerBand } from '@/lib/dictionary/browse/rank-pages'
import { locales } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { characters, descriptionLength, fitsTitle, siteTitle } from '@/lib/snippets'
import { pageProps } from '@/test/page-props'
import { categoryIndexRoute } from './category-index'
import { categoryRoute } from './category-routes'
import { jlptRoute, rankBandRoute } from './frequency-dictionaries/list-routes'
import { generateMetadata as frequencyHub } from './frequency-dictionaries/page'
import { generateMetadata as kanaCharts } from './kana/page'
import { kanaRoute, scriptIndexRoute } from './kana-routes'
import { generateMetadata as kanjiList } from './kanji/[list]/page'
import { generateMetadata as kanjiHub } from './kanji/page'
import { generateMetadata as browseHub } from './page'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))

type Asked = (props: never) => Promise<Metadata>

const browsePages: [string, Asked, Record<string, string>][] = [
  ['the browse hub', browseHub, {}],
  ['the kana charts', kanaCharts, {}],
  ['the kanji hub', kanjiHub, {}],
  ['the frequency hub', frequencyHub, {}],
  ['the parts of speech', categoryIndexRoute('partOfSpeech').generateMetadata, {}],
  ['the usage labels', categoryIndexRoute('usage').generateMetadata, {}],
  ['the subjects', categoryIndexRoute('subject').generateMetadata, {}],
  ['hiragana', scriptIndexRoute('hiragana').generateMetadata, {}],
  ['katakana', scriptIndexRoute('katakana').generateMetadata, {}],
  ['words starting with い', kanaRoute('hiragana').generateMetadata, { prefix: 'い' }],
  ['words starting with いる', kanaRoute('hiragana').generateMetadata, { prefix: 'いる' }],
  ['ichidan verbs', categoryRoute('used').generateMetadata, { category: 'ichidan-verbs' }],
  ['JLPT N5 vocabulary', jlptRoute.generateMetadata, { level: 'n5' }],
  ['YouTube’s first band', rankBandRoute.generateMetadata, { list: 'youtube', band: '1-1000' }],
  ['anime’s first band', rankBandRoute.generateMetadata, { list: 'anime', band: '1-1000' }],
  ['grade 4 kanji', kanjiList, { list: 'grade-4' }],
  ['JLPT N5 kanji', kanjiList, { list: 'jlpt-n5' }],
  ['jinmeiyō kanji', kanjiList, { list: 'jinmeiyo' }]
]

describe('every kind of browse page fits search results', () => {
  for (const locale of locales) {
    test.each(browsePages)(`in ${locale}, %s`, async (_, generateMetadata, params) => {
      const metadata = await generateMetadata(pageProps({ locale, ...params }) as never)
      const description = String(metadata.description)
      expect(characters(description), description).toBeGreaterThanOrEqual(
        descriptionLength.shortest
      )
      expect(characters(description), description).toBeLessThanOrEqual(descriptionLength.longest)
      expect(fitsTitle(String(metadata.title)), siteTitle(String(metadata.title))).toBe(true)
    })
  }

  test.each(
    locales
  )('in %s, every ranked list’s every band page is titled within 70 characters', locale => {
    for (const list of rankedLists) {
      for (const { band } of allRankBands) {
        for (let page = 1; page <= rankPagesPerBand; page += 1) {
          const title = rankBandTitle(
            coreText(list.name, locale),
            rankPageRanks(band, page),
            locale
          )
          expect(fitsTitle(title), siteTitle(title)).toBe(true)
        }
      }
    }
  })

  test('the longest band title, and the kanji hub’s, are the ones the audit flagged, now fitting', () => {
    expect(siteTitle(rankBandTitle('Visual novels', rankBand(10), 'en'))).toBe(
      'Visual novels: most used Japanese words, 9,001–10,000 | Zenbu Japanese'
    )
    expect(characters(siteTitle(getDictionary('en').browse.kanji.hubTitle))).toBe(67)
  })
})
