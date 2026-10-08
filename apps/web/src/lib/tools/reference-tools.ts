import {
  browsePath,
  frequencyDictionariesPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { MenuSymbol } from '@/lib/site-menus'

export type ToolMark = { glyph: string } | { symbol: MenuSymbol }

export interface ReferenceTool {
  title: string
  line: string
  href: string
  mark: ToolMark
}

export const referenceTools: readonly ReferenceTool[] = [
  {
    title: 'Dictionary',
    line: 'Words and kanji, searched in Japanese, kana, romaji, or English.',
    href: '/dictionary/',
    mark: { symbol: 'search' }
  },
  {
    title: 'Hiragana chart',
    line: 'Every hiragana, with common words for each.',
    href: scriptPath('hiragana'),
    mark: { glyph: 'あ' }
  },
  {
    title: 'Katakana chart',
    line: 'Every katakana, with common words for each.',
    href: scriptPath('katakana'),
    mark: { glyph: 'ア' }
  },
  {
    title: 'Kanji lists',
    line: 'Kanji by school grade, JLPT level, and jinmeiyō.',
    href: kanjiListsPath,
    mark: { glyph: '漢' }
  },
  {
    title: 'Frequency lists',
    line: 'The most common words, from JLPT N5 to anime and YouTube.',
    href: frequencyDictionariesPath,
    mark: { symbol: 'chart' }
  },
  {
    title: 'Word categories',
    line: 'Words by part of speech, usage label, and subject.',
    href: browsePath,
    mark: { symbol: 'tag' }
  }
]
