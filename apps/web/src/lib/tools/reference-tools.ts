import {
  browsePath,
  frequencyDictionariesPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import type { ProductMark } from '@/lib/products/catalog'
import { site } from '@/lib/site'

export interface ReferenceTool {
  title: string
  line: string
  href: string
  mark: ProductMark
}

const referenceTools: readonly {
  id: keyof Dictionary['tools']['referenceTools']
  href: string
  mark: ProductMark
}[] = [
  { id: 'dictionary', href: '/dictionary/', mark: { glyph: site.mark, solid: true } },
  { id: 'hiragana', href: scriptPath('hiragana'), mark: { glyph: 'ひ' } },
  { id: 'katakana', href: scriptPath('katakana'), mark: { glyph: 'ヒ' } },
  { id: 'kanji', href: kanjiListsPath, mark: { glyph: '漢' } },
  { id: 'frequency', href: frequencyDictionariesPath, mark: { symbol: 'chart' } },
  { id: 'categories', href: browsePath, mark: { symbol: 'book' } }
]

export function referenceToolsIn(locale: Locale): ReferenceTool[] {
  const text = getDictionary(locale).tools.referenceTools
  return referenceTools.map(({ id, href, mark }) => ({ ...text[id], href, mark }))
}
