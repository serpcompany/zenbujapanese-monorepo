import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { visibleText } from './rendered'

export const creditLine = ({ name, credit, license, notice }: SourceCredit) =>
  `${name}: ${credit} ${license.name}.${notice ? ` ${notice}` : ''}`

export const listedWithLicence = (source: SourceCredit) => ({
  line: creditLine(source),
  links: [source.url, ...(source.license.url ? [source.license.url] : [])]
})

export function pageSourcesList(html: string): { line: string; links: string[] }[] {
  const sources = html.slice(html.indexOf('<footer'))
  return [...sources.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => ({
    line: visibleText(item),
    links: [...item.matchAll(/<a href="([^"]*)"/g)].map(([, href]) => href)
  }))
}
