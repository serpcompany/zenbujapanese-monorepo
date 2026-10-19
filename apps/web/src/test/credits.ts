import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { visibleText } from './rendered'

export const creditLine = ({ name, credit, license, notice }: SourceCredit) =>
  `${name}: ${credit} ${license.name}.${notice ? ` ${notice}` : ''}`

const linksOf = (source: SourceCredit) => [
  source.url,
  ...(source.license.url ? [source.license.url] : [])
]

export const listedWithLicence = (source: SourceCredit) => ({
  line: creditLine(source),
  links: linksOf(source)
})

export function listedInJapanese(source: SourceCredit) {
  const text = getDictionary('ja').sourceCredits
  return {
    line: fill(source.notice ? text.creditWithNotice : text.credit, {
      name: coreText(source.name, 'ja'),
      credit: coreText(source.credit, 'ja'),
      license: source.license.name,
      notice: source.notice ? coreText(source.notice, 'ja') : ''
    }),
    links: linksOf(source)
  }
}

export function pageSourcesList(html: string): { line: string; links: string[] }[] {
  const sources = html.slice(html.indexOf('<footer'))
  return [...sources.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => ({
    line: visibleText(item),
    links: [...item.matchAll(/<a href="([^"]*)"/g)].map(([, href]) => href)
  }))
}
