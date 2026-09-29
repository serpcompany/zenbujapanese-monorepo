// An example as a page links it: shared by data.ts, which reads the rows, and the rendered-page
// tests, so they render the page's real links.

import type { Example, ExampleToken } from './detail/examples'
import { hasSearchPath, kanjiPath, searchPath } from './urls'

/** With the page it links to; null when it has no page yet. */
export type Linked<T> = T & { path: string | null }

/** An example's word with where it links: its word page, or a search for an ambiguous word. */
export type PageExampleToken = Linked<ExampleToken>

export interface PageExample extends Omit<Example, 'tokens'> {
  tokens: PageExampleToken[]
}

/** Where a page's links go: a path, or null for a word or kanji without a page. */
export interface Links {
  word(entSeq: number | null): string | null
  kanji(character: string | null): string | null
}

/** The path of a word page in the dictionary database, under its stored slug. */
export const storedWordPath = (slug: string, entSeq: number) => `/dictionary/${slug}-${entSeq}/`

/** Links from a page read from the dictionary database, where every word has a page. */
export function databaseLinks(wordSlugs: Map<number, string>, kanjiPages: Set<string>): Links {
  return {
    word(entSeq) {
      const slug = entSeq === null ? undefined : wordSlugs.get(entSeq)
      return entSeq === null || slug === undefined ? null : storedWordPath(slug, entSeq)
    },
    kanji(character) {
      return character !== null && kanjiPages.has(character) ? kanjiPath(character) : null
    }
  }
}

/** An example with its links: a word to its page, an ambiguous word to a search for it. */
export function pageExample(example: Example, links: Links): PageExample {
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
