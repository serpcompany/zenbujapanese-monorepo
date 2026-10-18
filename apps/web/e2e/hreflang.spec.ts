import type { Page } from '@playwright/test'
import { pageTypes } from './page-types'
import { expect, test } from './test'

type Head = { lang: string; canonical: string; alternates: Record<string, string> }

const attributes = (tag: string) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value])
  )

const pathOf = (url: string) => {
  const { pathname, search } = new URL(url, 'https://zenbujapanese.com')
  return `${pathname}${search}`
}

async function headOf(request: Page['request'], path: string): Promise<Head> {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status(), path).toBe(200)
  const html = await response.text()
  const links = [...html.matchAll(/<link [^>]*>/g)].map(([tag]) => attributes(tag))
  const canonicals = links.filter(link => link.rel === 'canonical')
  expect(canonicals.length, `${path} has one canonical`).toBe(1)
  return {
    lang: html.match(/<html lang="([^"]+)"/)?.[1] ?? '',
    canonical: pathOf(canonicals[0].href),
    alternates: Object.fromEntries(
      links
        .filter(link => link.rel === 'alternate' && link.hreflang)
        .map(link => [link.hreflang, pathOf(link.href)])
    )
  }
}

function expectAPublishedPage(path: string, head: Head) {
  const languages = Object.keys(head.alternates).filter(code => code !== 'x-default')
  expect(languages, `${path} names English and Japanese`).toEqual(['en', 'ja'])
  expect(head.alternates[head.lang], `${path} names itself in its own language`).toBe(path)
  expect(head.canonical, `${path} is canonical in its own language`).toBe(path)
  expect(head.alternates['x-default'], `${path}'s x-default is the English page`).toBe(
    head.alternates.en
  )
}

async function expectReciprocal(request: Page['request'], path: string) {
  const head = await headOf(request, path)
  expectAPublishedPage(path, head)
  for (const alternate of Object.values(head.alternates)) {
    const other = await headOf(request, alternate)
    expect(other.alternates, `${alternate} names the same pages as ${path}`).toEqual(
      head.alternates
    )
  }
  return head
}

test.describe('hreflang (SERP localization standard)', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The head is the same at every width')
  })

  for (const sitemap of [
    { name: 'pages', file: '/sitemap-pages.xml', included: 'both homepages', paths: ['/', '/ja/'] },
    {
      name: 'tools',
      file: '/sitemap-tools.xml',
      included: 'both tools indexes',
      paths: ['/tools/', '/ja/tools/']
    }
  ]) {
    test(`every page in the ${sitemap.name} sitemap, ${sitemap.included} included, names its languages as its sitemap entry does, and they name it back`, async ({
      request
    }) => {
      const xml = await (await request.get(sitemap.file)).text()
      const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(.*?)<\/url>/g)].map(
        ([, loc, links]) => ({
          path: pathOf(loc),
          alternates: Object.fromEntries(
            [...links.matchAll(/<xhtml:link [^>]*\/>/g)].map(([tag]) => {
              const link = attributes(tag)
              return [link.hreflang, pathOf(link.href)]
            })
          )
        })
      )
      expect(entries.map(entry => entry.path)).toEqual(expect.arrayContaining(sitemap.paths))
      for (const entry of entries) {
        const head = await headOf(request, entry.path)
        expectAPublishedPage(entry.path, head)
        expect(head.alternates, `${entry.path} matches its sitemap entry`).toEqual(entry.alternates)
        for (const alternate of Object.values(head.alternates)) {
          expect(
            entries.some(other => other.path === alternate),
            alternate
          ).toBe(true)
        }
      }
    })
  }

  for (const { name, path } of pageTypes.filter(type => type.path.startsWith('/dictionary/'))) {
    test(`${name}: the English and Japanese pages name each other`, async ({ request }) => {
      const page = path.replace(/#.*$/, '')
      const head = await expectReciprocal(request, page)
      expect(head.lang).toBe('en')
      expect((await headOf(request, `/ja${page}`)).lang).toBe('ja')
    })
  }
})
