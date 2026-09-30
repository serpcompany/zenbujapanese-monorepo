// The conjugations sitemap's contents (#511): every word with a conjugation table, and the form
// screens search engines may index, those that list examples (`indexedForms` in
// ../detail/conjugation.ts). Whether a form lists examples is what its screen would list
// (`Dictionary.formSentences`), worked out for every spelling at once rather than by a search
// each: one pass over the sentences finds every spelling's, `rankJapanese` ranks them as the
// app's Japanese search does, and the first in which Kuromoji reads the form as one word decides.
// The service runs it once, in the background, when it starts.

import { conjugationTable, indexedForms } from '../detail/conjugation'
import { wordSlug } from '../detail/slug'
import type { Tokenize } from '../examples/morphology'
import { isASCII, normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { ExampleSentence } from './example-retrieval'
import { allExampleSentences, rankJapanese, searchExamples } from './example-search'
import { usesFormIn } from './word-examples'
import { jmdictSource } from './words'

/** A word with a conjugation table, and its form screens search engines may index. */
export interface ConjugationSitemapWord {
  entSeq: number
  /** The slug the word's pages live under. */
  slug: string
  /** Each indexed form screen, as `<register>/<kind>` (`plain/past`). */
  forms: string[]
}

interface TrieNode {
  next: Map<number, TrieNode>
  surface: string | null
}

/**
 * The spellings in `surfaces` that a conjugated form's screen lists examples for: the same answer
 * as `formSentences(surface).length > 0`, for all of them in one pass. As there, each searches as
 * normalized and keeps the sentences that contain it as written.
 */
export function formsWithExamples(
  db: ArtifactDatabase,
  surfaces: readonly string[],
  tokenize: Tokenize
): Set<string> {
  const found = new Set<string>()
  const forms = [...new Set(surfaces)]
    .map(surface => ({ surface, query: normalizeQuery(surface) }))
    .filter(form => form.query !== '')

  // Each sentence's analysis once, however many forms ask.
  const answers = new Map<number, Map<string, boolean>>()
  const uses = (sentence: ExampleSentence, surface: string) => {
    let known = answers.get(sentence.rowid)
    if (!known) {
      known = new Map()
      answers.set(sentence.rowid, known)
    }
    let answer = known.get(surface)
    if (answer === undefined) {
      answer = usesFormIn(sentence.japanese, surface, tokenize)
      known.set(surface, answer)
    }
    return answer
  }

  // A form whose query is ASCII searches English, as its screen does; there are few.
  for (const { surface, query } of forms.filter(form => isASCII(form.query))) {
    const searched = searchExamples(db, query)
    if (typeof searched !== 'string' && searched.sentences.some(s => uses(s, surface))) {
      found.add(surface)
    }
  }

  // Every other form: the sentences that contain its query, found by walking a trie of the
  // queries from each position of each sentence, as `instr` finds them one query at a time.
  const japanese = forms.filter(form => !isASCII(form.query))
  const root: TrieNode = { next: new Map(), surface: null }
  for (const query of new Set(japanese.map(form => form.query))) {
    let node = root
    for (let index = 0; index < query.length; index++) {
      const unit = query.charCodeAt(index)
      let child = node.next.get(unit)
      if (!child) {
        child = { next: new Map(), surface: null }
        node.next.set(unit, child)
      }
      node = child
    }
    node.surface = query
  }
  const containing = new Map<string, ExampleSentence[]>()
  for (const sentence of allExampleSentences(db)) {
    const text = sentence.japanese
    const seen = new Set<string>()
    for (let start = 0; start < text.length; start++) {
      let node: TrieNode | undefined = root
      for (let index = start; index < text.length && node; index++) {
        node = node.next.get(text.charCodeAt(index))
        if (node?.surface && !seen.has(node.surface)) {
          seen.add(node.surface)
          const list = containing.get(node.surface)
          if (list) list.push(sentence)
          else containing.set(node.surface, [sentence])
        }
      }
    }
  }
  // The app's first 100, in its order.
  for (const { surface, query } of japanese) {
    const ranked = rankJapanese(query, containing.get(query) ?? []).sentences
    if (ranked.some(sentence => uses(sentence, surface))) found.add(surface)
  }
  return found
}

/**
 * Every JMdict word with a conjugation table, in `ent_seq` order, with the form screens search
 * engines may index.
 */
export function conjugationSitemap(
  db: ArtifactDatabase,
  tokenize: Tokenize
): ConjugationSitemapWord[] {
  const tables = db
    .all<{ ent_seq: number; headword: string; reading: string; parts_of_speech_json: string }>(
      `SELECT source_record_id AS ent_seq, headword, reading, parts_of_speech_json FROM entries
       WHERE source_identity = ? ORDER BY source_record_id`,
      [jmdictSource]
    )
    .flatMap(word => {
      const table = conjugationTable({
        headword: word.headword,
        reading: word.reading,
        partsOfSpeech: JSON.parse(word.parts_of_speech_json)
      })
      return table ? [{ word, table }] : []
    })
  const surfaces = tables.flatMap(({ table }) =>
    [...table.plain, ...table.polite].map(form => form.surface)
  )
  const withExamples = formsWithExamples(db, surfaces, tokenize)
  return tables.map(({ word, table }) => ({
    entSeq: word.ent_seq,
    slug: wordSlug(word.headword, word.reading),
    forms: indexedForms(table, surface => withExamples.has(surface))
  }))
}
