import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { pageFor, type SitePath } from '@/lib/pages'
import { visibleText } from '@/test/rendered'
import AboutPage from './about/page'
import ContactPage from './contact/page'
import AffiliateDisclosurePage from './legal/affiliate-disclosure/page'
import DmcaPage from './legal/dmca/page'
import LegalPage from './legal/page'
import PrivacyPage from './legal/privacy/page'
import TermsPage from './legal/terms/page'
import SupportPage from './support/page'

type LocalePage = (props: { params: Promise<{ locale: string }> }) => Promise<React.ReactElement>

const pages: [SitePath, LocalePage][] = [
  ['/about/', AboutPage as LocalePage],
  ['/contact/', ContactPage as LocalePage],
  ['/support/', SupportPage as LocalePage],
  ['/legal/', LegalPage as LocalePage],
  ['/legal/privacy/', PrivacyPage as LocalePage],
  ['/legal/terms/', TermsPage as LocalePage],
  ['/legal/dmca/', DmcaPage as LocalePage],
  ['/legal/affiliate-disclosure/', AffiliateDisclosurePage as LocalePage]
]

async function htmlOf(page: LocalePage, locale: Locale) {
  return renderToStaticMarkup(await page({ params: Promise.resolve({ locale }) }))
}

const pageLinks = (html: string) => [...html.matchAll(/href="(\/[^"]*)"/g)].map(([, href]) => href)

const linksInItsLanguage = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>/g)]
    .map(([, attributes]) => attributes)
    .filter(attributes => !attributes.includes('hrefLang="en"'))
    .flatMap(attributes => pageLinks(attributes))

const legalPages = pages.filter(([path]) => path.startsWith('/legal/') && path !== '/legal/')

describe('the company and legal pages', () => {
  test.each(pages)('%s is headed by its title in each language', async (path, page) => {
    for (const locale of ['en', 'ja'] as const) {
      expect(await htmlOf(page, locale)).toContain(
        `<h1 class="text-2xl font-semibold">${pageFor(path, locale).title}</h1>`
      )
    }
  })

  test.each(
    pages
  )('%s links only Japanese pages from its Japanese version, but the English original', async (_, page) => {
    expect(
      linksInItsLanguage(await htmlOf(page, 'ja')).filter(href => !href.startsWith('/ja/'))
    ).toEqual([])
  })

  test.each(
    legalPages
  )('%s in Japanese says first that the English version prevails, and links it', async (path, page) => {
    const html = await htmlOf(page, 'ja')
    const notice =
      html.match(/<\/h1>(?:<p [^>]*>施行日：[^<]*<\/p>)?<p [^>]*>(.*?)<\/p>/)?.[1] ?? ''
    expect(visibleText(notice)).toBe(
      'このページは英語の原文を翻訳したものです。内容に相違がある場合は、英語版が優先されます。'
    )
    const link = notice.match(/<a ([^>]*)>英語版<\/a>/)?.[1] ?? ''
    expect(link).toContain(`href="${path}"`)
    expect(link).toContain('hrefLang="en"')
    expect(visibleText(await htmlOf(page, 'en'))).not.toContain('English version prevails')
  })

  test('the Japanese affiliate disclosure says its links are marked as advertising under 景品表示法', async () => {
    const japanese = visibleText(await htmlOf(AffiliateDisclosurePage as LocalePage, 'ja'))
    expect(japanese).toContain('ステルスマーケティング規制に沿って、広告であることを表示しています')
    expect(visibleText(await htmlOf(AffiliateDisclosurePage as LocalePage, 'en'))).not.toContain(
      'stealth marketing'
    )
  })

  test('each legal page writes its effective date in the reader’s language', async () => {
    expect(visibleText(await htmlOf(PrivacyPage as LocalePage, 'en'))).toContain(
      'Effective October 18, 2026'
    )
    expect(visibleText(await htmlOf(TermsPage as LocalePage, 'en'))).toContain(
      'Effective September 28, 2026'
    )
    expect(visibleText(await htmlOf(PrivacyPage as LocalePage, 'ja'))).toContain(
      '施行日：2026年10月18日'
    )
  })

  test('the Legal page lists each policy, linked in the reader’s language', async () => {
    expect(pageLinks(await htmlOf(LegalPage as LocalePage, 'en'))).toEqual([
      '/legal/privacy/',
      '/legal/terms/',
      '/legal/dmca/',
      '/legal/affiliate-disclosure/'
    ])
    expect(pageLinks(await htmlOf(LegalPage as LocalePage, 'ja'))).toEqual([
      '/ja/legal/privacy/',
      '/ja/legal/terms/',
      '/ja/legal/dmca/',
      '/ja/legal/affiliate-disclosure/'
    ])
  })

  test('the Japanese Support page links Tomodachi’s part of the Japanese Privacy Policy', async () => {
    const html = await htmlOf(SupportPage as LocalePage, 'ja')
    expect(html).toContain('<a href="/ja/legal/privacy/#tomodachi">')
    expect(html).toContain('<a href="mailto:support@zenbujapanese.com">')
  })
})
