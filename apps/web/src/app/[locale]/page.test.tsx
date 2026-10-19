import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import HomePage, { generateMetadata } from './page'

const propsFor = (locale: Locale) =>
  ({ params: Promise.resolve({ locale }) }) as PageProps<'/[locale]'>

const homepage = async (locale: Locale) => renderToStaticMarkup(await HomePage(propsFor(locale)))

const pageLinks = (html: string) =>
  [...html.matchAll(/<a [^>]*href="(\/[^/"][^"]*)"/g)].map(([, href]) => href)

function link(html: string, text: string) {
  const anchor = [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].find(
    ([, , inner]) => inner === text
  )
  const attribute = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(anchor?.[1] ?? '')?.[1]
  return { href: attribute('href'), lang: attribute('lang') }
}

describe('the homepage', () => {
  test('in English, keeps its title, description, and links', async () => {
    const metadata = await generateMetadata(propsFor('en'))
    expect(metadata.title).toEqual({
      absolute: 'Zenbu Japanese: Japanese Dictionary and Translator for iPhone'
    })
    expect(metadata.openGraph).toMatchObject({ locale: 'en_US', siteName: 'Zenbu Japanese' })
    const html = await homepage('en')
    expect(html).toContain('Understand the Japanese you meet</h1>')
    expect(html).toContain('View 50+ Example Sentences')
    expect(html).toContain('href="/dictionary/"')
    expect(link(html, 'taberu')).toEqual({ href: '/dictionary/search/taberu/', lang: 'ja-Latn' })
    expect(link(html, 'to persevere').lang).toBeUndefined()
    expect(pageLinks(html).filter(href => href.startsWith('/ja/'))).toEqual([])
  })

  test('in Japanese, is titled for its keyword and links only Japanese pages', async () => {
    const metadata = await generateMetadata(propsFor('ja'))
    const title = 'Zenbu Japanese：iPhoneのオフライン和英辞典・翻訳アプリ'
    expect(metadata.title).toEqual({ absolute: title })
    expect(metadata.openGraph).toMatchObject({ locale: 'ja_JP', title })
    expect(metadata.description).toContain('和英辞典')
    const html = await homepage('ja')
    expect(html).toContain('目の前の日本語が、英語でわかる</h1>')
    expect(html).toContain('href="/ja/dictionary/"')
    expect(html).toContain('href="/ja/products/zenbu-japanese-app/"')
    expect(link(html, '大丈夫').lang).toBeUndefined()
    expect(link(html, 'to persevere').lang).toBe('en')
    expect(html).toContain('zenbujapanese.com/ja/dictionary/search/taberu/')
    expect(pageLinks(html).filter(href => !href.startsWith('/ja/'))).toEqual([])
    expect(html).not.toMatch(
      /Understand the Japanese|Try the dictionary|Free on the web|Learn more|Example Sentences/
    )
  })
})
