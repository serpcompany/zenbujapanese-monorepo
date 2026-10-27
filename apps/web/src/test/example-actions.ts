import { addWordPaths, exampleTargets, wordLinks } from '@/components/dictionary/word-links'
import type { PageExample } from '@/lib/dictionary/page-example'
import { type Locale, sourceLang } from '@/lib/i18n/config'

export function exampleActions(examples: readonly PageExample[], locale: Locale = 'en') {
  return {
    lang: sourceLang(locale),
    renderWordLink: wordLinks(addWordPaths(new Map(), exampleTargets(examples)), locale),
    onUnsupported: () => {}
  }
}

export function conjugationActions(locale: Locale = 'en') {
  return { ...exampleActions([], locale), loadFormExamples: async () => [] }
}
