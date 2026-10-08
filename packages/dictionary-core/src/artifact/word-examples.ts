import type { SegmentedToken } from '../cards/segmentation'
import type {
  ExampleCountRow,
  ExampleLinkRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow,
  WordExampleRows
} from '../detail/rows'
import { usesForm } from '../examples/forms'
import { toHiragana } from '../examples/kana'
import {
  displayReading,
  type HighlightedEntry,
  type LinkedToken,
  linkedTokens
} from '../examples/linking'
import { kuromojiCandidates, type Tokenize } from '../examples/morphology'
import { normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { EntryExamples, ExampleSentence } from './example-retrieval'
import type { FormLookup } from './lookup'

export type ExamplesEntry = HighlightedEntry

const contributor = (name: string | null, status: string) =>
  status === 'named' && name ? name : null

const hasKanji = (text: string) => /[㐀-鿿々]/u.test(text)

interface Provenance {
  pair_id: string
  source_japanese_record_id: number
  japanese_contributor: string | null
  japanese_contributor_status: string
  japanese_license: string
  source_english_record_id: number
  english_contributor: string | null
  english_contributor_status: string
  english_license: string
}

function provenance(db: ArtifactDatabase, pairIds: readonly string[]): Map<string, Provenance> {
  if (pairIds.length === 0) return new Map()
  const rows = db.all<Provenance>(
    `SELECT lower(hex(pair_id)) AS pair_id, source_japanese_record_id, japanese_contributor,
       japanese_contributor_status, japanese_license, source_english_record_id,
       english_contributor, english_contributor_status, english_license
     FROM example_sentence_provenance WHERE pair_id IN (${pairIds.map(() => 'unhex(?)').join(', ')})`,
    pairIds
  )
  return new Map(rows.map(row => [row.pair_id, row]))
}

interface LinkedEntry {
  entSeq: number
  headword: string
  reading: string
  writtenForms: string[]
  readingForms: string[]
}

function linkedEntries(db: ArtifactDatabase, ids: readonly string[]): Map<string, LinkedEntry> {
  if (ids.length === 0) return new Map()
  const rows = db.all<{
    id: string
    ent_seq: number
    headword: string
    reading: string
    written_forms_json: string
    reading_forms_json: string
  }>(
    `SELECT lower(hex(id)) AS id, source_record_id AS ent_seq, headword, reading,
       written_forms_json, reading_forms_json
     FROM entries WHERE id IN (${ids.map(() => 'unhex(?)').join(', ')})`,
    ids
  )
  const values = (json: string) => (JSON.parse(json) as { value: string }[]).map(form => form.value)
  return new Map(
    rows.map(row => [
      row.id,
      {
        entSeq: row.ent_seq,
        headword: row.headword,
        reading: row.reading,
        writtenForms: values(row.written_forms_json),
        readingForms: values(row.reading_forms_json)
      }
    ])
  )
}

function tokenRows(tokens: readonly LinkedToken[]): ExampleSentenceTokenRow[] {
  return tokens.map(token => {
    const row: ExampleSentenceTokenRow = { text: token.surface }
    if (hasKanji(token.surface)) row.reading = toHiragana(token.reading)
    if (token.dictionaryForm !== token.surface) row.dictionaryForm = token.dictionaryForm
    return row
  })
}

export function segmentText(
  db: ArtifactDatabase,
  text: string,
  capabilities: { tokenize: Tokenize; lookup: FormLookup }
): SegmentedToken[] {
  const linked = linkedTokens(
    text,
    kuromojiCandidates(text, capabilities.tokenize(text)),
    null,
    capabilities.lookup
  )
  const rows = tokenRows(linked)
  const entries = linkedEntries(db, [
    ...new Set(linked.flatMap(token => (token.entry ? [token.entry.id] : [])))
  ])
  return linked.map((token, position) => {
    const target = token.entry ? entries.get(token.entry.id) : undefined
    const row = rows[position]
    return {
      ...row,
      ...(target && hasKanji(token.surface) ? { reading: displayReading(token, target) } : {}),
      ...(token.entry ? { languageReferenceID: token.entry.id } : {}),
      ...(!token.entry && token.candidates.length > 0
        ? { candidates: token.candidates.map(candidate => candidate.id) }
        : {})
    }
  })
}

export function exampleCount(retrieved: EntryExamples): ExampleCountRow | null {
  if (retrieved.sentences.length === 0) return null
  return {
    listed: retrieved.sentences.length,
    count: retrieved.count,
    truncated: retrieved.truncated
  }
}

export interface ExampleHighlight {
  entry: ExamplesEntry | null
  query: string
  accent: 'entry' | 'query'
}

function tokenSpans(tokens: readonly LinkedToken[]): { start: number; end: number }[] {
  let start = 0
  return tokens.map(token => {
    const end = start + Array.from(token.surface).length
    const span = { start, end }
    start = end
    return span
  })
}

function occurrences(text: string, query: string): { start: number; end: number }[] {
  const scalars = Array.from(text)
  const needle = Array.from(query)
  if (needle.length === 0 || needle.length > scalars.length) return []
  const found: { start: number; end: number }[] = []
  for (let start = 0; start + needle.length <= scalars.length; start++) {
    if (needle.every((scalar, index) => scalars[start + index] === scalar)) {
      found.push({ start, end: start + needle.length })
    }
  }
  return found
}

export function exampleRows(
  db: ArtifactDatabase,
  sentences: readonly ExampleSentence[],
  firstPosition: number,
  highlight: ExampleHighlight,
  capabilities: { tokenize: Tokenize; lookup: FormLookup },
  entSeq = 0
): WordExampleRows[] {
  const credits = provenance(
    db,
    sentences.map(sentence => sentence.pairId)
  )
  const highlighted = highlight.entry ? { entry: highlight.entry, query: highlight.query } : null

  const linked = sentences.map(sentence => {
    const analysis = kuromojiCandidates(sentence.japanese, capabilities.tokenize(sentence.japanese))
    const shared = linkedTokens(sentence.japanese, analysis, null, capabilities.lookup)
    return {
      sentence,
      shared,
      page: highlighted
        ? linkedTokens(sentence.japanese, analysis, highlighted, capabilities.lookup)
        : shared
    }
  })
  const ids = new Set<string>()
  for (const { shared, page } of linked) {
    for (const token of [...shared, ...page]) {
      for (const candidate of token.candidates) ids.add(candidate.id)
    }
  }
  const entries = linkedEntries(db, [...ids])
  const entSeqOf = (id: string) => {
    const found = entries.get(id)
    if (!found) throw new Error(`An example links to ${id}, which the artifact doesn't hold`)
    return found.entSeq
  }

  return linked.map(({ sentence, shared, page }, index): WordExampleRows => {
    const sharedRows = tokenRows(shared)
    const sameWordsAsElsewhere =
      page.length === shared.length &&
      page.every((token, position) => token.surface === shared[position].surface)
    const rows = sameWordsAsElsewhere ? sharedRows : tokenRows(page)
    const links: ExampleLinkRow[] = []
    for (const [position, token] of page.entries()) {
      if (token.entry) {
        const link: ExampleLinkRow = { token: position, entSeqs: [entSeqOf(token.entry.id)] }
        const target = entries.get(token.entry.id)
        if (target && hasKanji(token.surface)) {
          const reading = displayReading(token, target)
          if (reading !== rows[position].reading) link.reading = reading
        }
        links.push(link)
      } else if (token.candidates.length > 0) {
        links.push({
          token: position,
          entSeqs: token.candidates.map(candidate => entSeqOf(candidate.id))
        })
      }
    }
    let highlights: number[]
    if (highlight.accent === 'entry') {
      const id = highlight.entry?.id
      highlights = page.flatMap((token, position) =>
        id && token.entry?.id === id ? [position] : []
      )
    } else {
      const found = occurrences(sentence.japanese, highlight.query)
      highlights = tokenSpans(page).flatMap((span, position) =>
        found.some(match => match.start < span.end && span.start < match.end) ? [position] : []
      )
    }
    return {
      sentence: exampleSentenceRow(sentence, sharedRows, credits.get(sentence.pairId)),
      example: {
        entSeq,
        position: firstPosition + index,
        sentenceId: sentence.rowid,
        highlights,
        links,
        tokens: sameWordsAsElsewhere ? null : rows
      }
    }
  })
}

export function wordExampleRows(
  db: ArtifactDatabase,
  entSeq: number,
  entry: ExamplesEntry,
  retrieved: EntryExamples,
  from: number,
  limit: number,
  capabilities: { tokenize: Tokenize; lookup: FormLookup }
): WordExampleRows[] {
  return exampleRows(
    db,
    retrieved.sentences.slice(from, from + limit),
    from,
    { entry, query: normalizeQuery(entry.headword), accent: 'entry' },
    capabilities,
    entSeq
  )
}

export function conjugatedFormExamples(
  searched: EntryExamples,
  form: string,
  tokenize: Tokenize
): ExampleSentence[] {
  return searched.sentences.filter(sentence => usesFormIn(sentence.japanese, form, tokenize))
}

function usesFormIn(japanese: string, form: string, tokenize: Tokenize): boolean {
  return usesForm(japanese, kuromojiCandidates(japanese, tokenize(japanese)), form)
}

function exampleSentenceRow(
  sentence: ExampleSentence,
  tokens: ExampleSentenceTokenRow[],
  credit: Provenance | undefined
): ExampleSentenceRow {
  if (!credit) throw new Error(`Example pair ${sentence.pairId} has no provenance`)
  return {
    id: sentence.rowid,
    pairId: sentence.pairId,
    japanese: sentence.japanese,
    english: sentence.english,
    tokens,
    japaneseTatoebaId: credit.source_japanese_record_id,
    japaneseContributor: contributor(
      credit.japanese_contributor,
      credit.japanese_contributor_status
    ),
    japaneseLicense: credit.japanese_license,
    englishTatoebaId: credit.source_english_record_id,
    englishContributor: contributor(credit.english_contributor, credit.english_contributor_status),
    englishLicense: credit.english_license
  }
}

export function exampleLinkEntSeqs(
  examples: readonly { example: Pick<WordExampleRows['example'], 'links'> }[]
): number[] {
  return [
    ...new Set(
      examples.flatMap(({ example }) =>
        example.links.flatMap(link => (link.entSeqs.length === 1 ? link.entSeqs : []))
      )
    )
  ]
}
