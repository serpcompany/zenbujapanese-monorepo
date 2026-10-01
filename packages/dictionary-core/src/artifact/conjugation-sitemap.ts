import { conjugationTable, indexedForms } from '../detail/conjugation'
import { wordSlug } from '../detail/slug'
import type { Tokenize } from '../examples/morphology'
import { isASCII, normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { ExampleSentence } from './example-retrieval'
import { allExampleSentences, rankJapanese, searchExamples } from './example-search'
import { usesFormIn } from './word-examples'
import { jmdictSource } from './words'

export interface ConjugationSitemapWord {
  entSeq: number
  slug: string
  forms: string[]
}

interface TrieNode {
  next: Map<number, TrieNode>
  surface: string | null
}

function memoizedUsesForm(tokenize: Tokenize) {
  const answers = new Map<number, Map<string, boolean>>()
  return (sentence: ExampleSentence, surface: string) => {
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
}

function queryTrie(queries: Iterable<string>): TrieNode {
  const root: TrieNode = { next: new Map(), surface: null }
  for (const query of queries) {
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
  return root
}

function sentencesContainingEach(
  sentences: readonly ExampleSentence[],
  queries: Iterable<string>
): Map<string, ExampleSentence[]> {
  const root = queryTrie(queries)
  const containing = new Map<string, ExampleSentence[]>()
  for (const sentence of sentences) {
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
  return containing
}

export function formsWithExamples(
  db: ArtifactDatabase,
  surfaces: readonly string[],
  tokenize: Tokenize
): Set<string> {
  const found = new Set<string>()
  const forms = [...new Set(surfaces)]
    .map(surface => ({ surface, query: normalizeQuery(surface) }))
    .filter(form => form.query !== '')
  const uses = memoizedUsesForm(tokenize)

  const englishForms = forms.filter(form => isASCII(form.query))
  for (const { surface, query } of englishForms) {
    const searched = searchExamples(db, query)
    if (typeof searched !== 'string' && searched.sentences.some(s => uses(s, surface))) {
      found.add(surface)
    }
  }

  const japaneseForms = forms.filter(form => !isASCII(form.query))
  const containing = sentencesContainingEach(
    allExampleSentences(db),
    new Set(japaneseForms.map(form => form.query))
  )
  for (const { surface, query } of japaneseForms) {
    const ranked = rankJapanese(query, containing.get(query) ?? []).sentences
    if (ranked.some(sentence => uses(sentence, surface))) found.add(surface)
  }
  return found
}

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
