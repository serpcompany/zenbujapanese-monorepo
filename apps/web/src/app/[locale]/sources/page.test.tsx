import { creditsShownBy, type SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { visibleText } from '@/test/rendered'
import SourcesPage from './page'

const html = renderToStaticMarkup(<SourcesPage />)
const text = visibleText(html)
const { conversionNotice, credits } = creditsShownBy('website')

const creditLine = ({ name, credit, license, notice }: SourceCredit) =>
  `${name}: ${credit} ${license.name}.${notice ? ` ${notice}` : ''}`

describe('the Sources page', () => {
  test('lists every credit the core gives the website, in its order, with its licence and notice', () => {
    expect(text).toContain(credits.map(creditLine).join(''))
    expect(text).toContain('Sudachi')
    expect(text).not.toContain('DaKanji')
  })

  test('links each source to its project', () => {
    for (const { url, name } of credits) {
      expect(html, name).toContain(`<li><a href="${url}">${name}</a>`)
    }
  })

  test('says Jiten’s lists were modified, with the share-alike notice', () => {
    expect(text).toContain(
      'by Jiten (jiten.moe), modified. CC BY-SA 4.0. The rankings from Jiten are adapted from its data, and are shared under the same licence, CC BY-SA 4.0.'
    )
  })

  test('says every source is converted, and Creative Commons data shared alike', () => {
    expect(text).toContain(conversionNotice)
  })

  test('links each licence that has a page of its own', () => {
    expect(html).toContain(
      '<a href="https://www.edrdg.org/edrdg/licence.html">EDRDG licence, CC BY-SA 4.0</a>'
    )
    expect(html).toContain('Apache-2.0 · IPADIC.')
  })
})
