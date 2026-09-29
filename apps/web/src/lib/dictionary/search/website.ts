import { DictionarySearch, d1SearchDatabase, type SearchCapabilities } from './search'

/**
 * The capabilities the website supplies: none. Sentence search needs the app's Japanese
 * analyzer, Sudachi, whose 217 MB dictionary is more than a Worker's 128 MB of memory, so the
 * website leaves it off and is a glossary of words and kanji (ADR 0008).
 */
export const websiteCapabilities: SearchCapabilities = {}

export function websiteSearch(db: D1Database): DictionarySearch {
  return new DictionarySearch(d1SearchDatabase(db), websiteCapabilities)
}
