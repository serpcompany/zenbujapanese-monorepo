import type { Slugs } from '@zenbu/dictionary-core/artifact/dictionary'
import type { Example, ExampleToken } from '@zenbu/dictionary-core/detail/examples'
import { hasSearchPath, kanjiSearchPath, searchPath } from './urls'

export type Linked<T> = T & { path: string | null }

export type PageExampleToken = Linked<ExampleToken>

export interface PageExample extends Omit<Example, 'tokens' | 'japanese' | 'english'> {
  tokens: PageExampleToken[]
}

export interface Links {
  word(entSeq: number | null): string | null
  kanji(character: string | null): string | null
}

export const storedWordPath = (slug: string, entSeq: number) => `/dictionary/${slug}-${entSeq}/`

export function serviceLinks(slugs: Slugs, kanjiPages: readonly string[]): Links {
  const pages = new Set(kanjiPages)
  return {
    word(entSeq) {
      const slug = entSeq === null ? undefined : slugs[entSeq]
      return entSeq === null || slug === undefined ? null : storedWordPath(slug, entSeq)
    },
    kanji(character) {
      return character !== null && pages.has(character) ? kanjiSearchPath(character) : null
    }
  }
}

export function pageExample(
  { japanese: _japanese, english: _english, ...example }: Example,
  links: Links
): PageExample {
  return {
    ...example,
    tokens: example.tokens.map(token => ({
      ...token,
      path: !token.link
        ? null
        : 'entSeq' in token.link
          ? links.word(token.link.entSeq)
          : hasSearchPath(token.link.query)
            ? searchPath(token.link.query)
            : null
    }))
  }
}
