import {
  type RenderWordLink,
  type WordLinkTarget,
  wordLinkKey
} from '@zenbu/ui/dictionary/word-link'
import Link from 'next/link'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'
import type { PageExample } from '@/lib/dictionary/page-example'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'

export type LinkedTarget = readonly [WordLinkTarget, string | null]

export function addWordPaths(paths: Map<string, string>, targets: Iterable<LinkedTarget>) {
  for (const [target, path] of targets) if (path) paths.set(wordLinkKey(target), path)
  return paths
}

export function exampleTargets(examples: readonly PageExample[]): LinkedTarget[] {
  return examples.flatMap(example =>
    example.tokens.flatMap(token => (token.link ? [[token.link, token.path] as const] : []))
  )
}

export function kanjiTargets(kanji: KanjiDetailsData): LinkedTarget[] {
  return [
    ...kanji.readings.flatMap(reading =>
      reading.words.map(word => [{ entSeq: word.entSeq }, word.path] as const)
    ),
    ...kanji.components.map(component => [{ kanji: component.character }, component.path] as const),
    ...kanji.elements.map(element => [{ kanji: element.character }, element.path] as const),
    ...kanji.words.map(word => [{ entSeq: word.entSeq }, word.path] as const)
  ]
}

export function wordLinks(paths: ReadonlyMap<string, string>, locale: Locale): RenderWordLink {
  return ({ target, ...props }) => {
    const path = paths.get(wordLinkKey(target))
    return path ? <Link href={localizedPath(path, locale)} {...props} /> : null
  }
}
