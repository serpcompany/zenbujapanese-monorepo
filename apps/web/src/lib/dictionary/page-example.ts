// An example as a page links it: shared by data.ts, which reads the rows, and the rendered-page
// tests, so they render the page's real links.

import type { Example, ExampleToken } from './detail/examples'
import { hasSearchPath, searchPath } from './urls'

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

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
