// Precomputes every word page's examples into the dictionary database (issue 464, #465 PR 6):
// the sentences the app lists for each entry, in its order and at most 100, and each sentence's
// words as the app links them on that entry's page.
//
//   pnpm exec tsx scripts/release-d1/dictionary/build-examples.mts <LanguageReferenceData.sqlite3> <resources dir> <out prefix>
//   pnpm exec tsx scripts/release-d1/dictionary/build-examples.mts <LanguageReferenceData.sqlite3> <resources dir> <out.json> <ent_seq,...>
//
// `resources dir` is the app's SearchExperience/Resources: ExampleWordIndex.sqlite3 and the
// Kuromoji build. Writes SQL files `<out prefix>-01.sql`, `-02.sql`, and so on, each under
// 100 MB (Wrangler drops larger ones locally), with INSERTs for example_sentences (each
// listed Tatoeba pair once, with its Kuromoji tokens and both sides' attribution), word_examples
// (per entry and position: which tokens are the entry, and where each word links on its page),
// word_example_counts, form_examples (per conjugated form's spelling and position: which tokens
// make up the form, and where each word links on the form's screen), and word_conjugations (each
// word with a conjugation table, and which of its form screens search engines may index), and
// `<out prefix>-counts.json`, the rows each table should then hold. Given entry numbers, it writes
// only their rows, as JSON, for the local fixtures (scripts/export-dictionary-fixtures.py).
//
// Everything is the app's logic, ported: retrieval (src/lib/dictionary/examples/retrieval.ts,
// from ExampleSentenceClient.swift), the tokenizer (the app's pinned kuromoji.js and IPADIC,
// examples/kuromoji.ts), linking (examples/linking.ts, from JapaneseTextAnalysisClient.swift), the
// conjugator (detail/conjugation.ts, from JapaneseConjugationClient.swift), and which sentences a
// form's screen lists and accents (examples/forms.ts, from ConjugationsView.swift). It checks the
// fast retrieval against the app's own scan on a sample of entries from every retrieval path, and
// of forms, drawn per build, and fails on any difference; the word-detail conformance gate then
// checks the result against the app.

import { createHash } from 'node:crypto'
import { closeSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConjugationTable,
  conjugationTable,
  indexedForms
} from '../../../src/lib/dictionary/detail/conjugation'
import type {
  ExampleCountRow,
  ExampleLinkRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow,
  FormExampleRow,
  WordExampleRow
} from '../../../src/lib/dictionary/detail/rows'
import { queryHighlights, usesForm } from '../../../src/lib/dictionary/examples/forms'
import { toHiragana } from '../../../src/lib/dictionary/examples/kana'
import { loadKuromoji } from '../../../src/lib/dictionary/examples/kuromoji'
import {
  displayReading,
  type HighlightedEntry,
  type LinkedToken,
  linkedTokens
} from '../../../src/lib/dictionary/examples/linking'
import {
  kuromojiCandidates,
  type MorphologyCandidate
} from '../../../src/lib/dictionary/examples/morphology'
import {
  entryTerms,
  findOccurrences,
  type RetrievedExamples,
  retrieveEntryExamples,
  retrieveEntryExamplesByScan,
  retrieveJapaneseExamples,
  retrieveJapaneseExamplesByScan
} from '../../../src/lib/dictionary/examples/retrieval'
import { isASCII, normalizeQuery } from '../../../src/lib/dictionary/search/query'
import {
  canonicalEntries,
  corpus,
  type Entry,
  englishSearch,
  formLookup,
  openArtifact,
  readEntries,
  readForms,
  readSentences,
  readWordIndex
} from './examples-corpus'

/** D1 rejects statements over 100 KB. */
const maxStatementBytes = 90_000
/** A local D1 runs out of memory on an INSERT of about 5,000 rows, however short. */
const maxStatementRows = 500
/** Wrangler drops a local D1 file of 400 MB; 130 MB loads. */
const maxFileBytes = 100_000_000
/**
 * How many entries of each retrieval path have their retrieval checked against the app's scan,
 * drawn afresh for each build (seeded by ZENBU_EXAMPLES_SEED, the build ID).
 */
const checkedPerPath = 80

const [source, resources, outPath, only] = process.argv.slice(2)
if (!outPath) {
  throw new Error(
    'usage: build-examples.mts <LanguageReferenceData.sqlite3> <resources dir> <out> [ent_seq,...]'
  )
}
const fixtureEntSeqs = only ? new Set(only.split(',').map(Number)) : null

const started = Date.now()
let peakRss = 0
function log(message: string) {
  const rss = process.memoryUsage().rss
  peakRss = Math.max(peakRss, rss)
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  console.error(`build-examples: ${seconds} s, ${Math.round(rss / 2 ** 20)} MB: ${message}`)
}

// The corpus, and every entry as the app opens it.
const db = openArtifact(source, join(resources, 'ExampleWordIndex.sqlite3'))
const sentences = readSentences(db)
const entries = readEntries(db)
const canonical = canonicalEntries(entries)
if (fixtureEntSeqs) {
  for (const number of canonical.keys()) if (!fixtureEntSeqs.has(number)) canonical.delete(number)
}
const forms = readForms(db, entries)
const wordIndex = readWordIndex(db, sentences)
const pages = [...new Set(canonical.values())]
log(`read ${sentences.length} sentences and ${entries.length} entries (${pages.length} pages)`)

// Retrieval: where each term occurs, found once, then each page's examples.
const terms = new Set<string>()
for (const entry of pages) {
  const found = entryTerms(entry, forms)
  if (typeof found !== 'object') continue
  terms.add(found.selectedForm)
  for (const form of found.alternateForms) terms.add(form)
  terms.add(found.reading)
}

// Conjugated forms: every form of every word's table, as its page conjugates it. A form's screen
// searches for the form's spelling (`SearchQuery(form.surface)`), so its examples depend on the
// spelling alone, whichever word it comes from.
const tables = new Map<number, ConjugationTable>()
const formQueries = new Map<string, string>()
for (const entry of entries) {
  if (fixtureEntSeqs && !fixtureEntSeqs.has(entry.entSeq)) continue
  const table = conjugationTable(entry)
  if (!table) continue
  tables.set(entry.entSeq, table)
  for (const form of [...table.plain, ...table.polite]) {
    const query = normalizeQuery(form.surface)
    formQueries.set(form.surface, query)
    // A form whose spelling is ASCII once normalized, such as Ｈ, searches English.
    if (!isASCII(query)) terms.add(query)
  }
}

const exampleCorpus = corpus(sentences, forms, findOccurrences(sentences, terms), wordIndex)
log(`found where ${terms.size} terms occur`)

const retrieved = new Map<string, RetrievedExamples>()
for (const entry of pages) {
  const result = retrieveEntryExamples(entry, exampleCorpus)
  // The app shows no examples when retrieval throws.
  if (typeof result !== 'string' && result.sentences.length > 0) retrieved.set(entry.id, result)
}
log(`retrieved examples for ${retrieved.size} pages`)

// The fast path must list exactly what the app's scan lists. The sample covers every path:
// kana headwords (ExampleWordIndex), ambiguous forms, entries the app refuses, and written
// headwords with and without more than 100 matches.
const paths = new Map<string, Entry[]>()
for (const entry of pages) {
  const terms = entryTerms(entry, forms)
  const path =
    typeof terms === 'string'
      ? terms
      : retrieved.get(entry.id)?.truncated
        ? 'written, over 100'
        : 'written'
  const list = paths.get(path)
  if (list) list.push(entry)
  else paths.set(path, [entry])
}
let seed = createHash('sha256')
  .update(process.env.ZENBU_EXAMPLES_SEED ?? 'local')
  .digest()
  .readUInt32BE(0)
/** A seeded xorshift generator, so a build's sample can be drawn again. */
function random(): number {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 2 ** 32
}
const checked: Entry[] = []
for (const [path, candidates] of [...paths].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const drawn = new Set<Entry>()
  while (drawn.size < Math.min(checkedPerPath, candidates.length)) {
    drawn.add(candidates[Math.floor(random() * candidates.length)])
  }
  checked.push(...drawn)
  log(`checking ${drawn.size} of ${candidates.length} pages retrieved as ${path}`)
}
for (const entry of checked) {
  const fast = JSON.stringify(retrieveEntryExamples(entry, exampleCorpus))
  if (fast !== JSON.stringify(retrieveEntryExamplesByScan(entry, exampleCorpus))) {
    throw new Error(`Retrieval for ${entry.entSeq} differs from the app's scan`)
  }
}
log(`checked ${checked.length} pages' retrieval against the app's scan`)

// Every sentence through the app's Kuromoji, once.
const tokenize = loadKuromoji(join(resources, 'Kuromoji'))
const analyses = new Map<number, MorphologyCandidate[] | null>()
function analysis(sentence: number): MorphologyCandidate[] | null {
  if (!analyses.has(sentence)) {
    const { japanese } = sentences[sentence]
    analyses.set(sentence, kuromojiCandidates(japanese, tokenize(japanese)))
  }
  return analyses.get(sentence) ?? null
}

// Each form's examples (ConjugatedForm.examples): the first 100 sentences its search finds, then
// those in which the parser reads the form as one whole word.
const searchEnglish = englishSearch(db, sentences)
const formExamples = new Map<string, number[]>()
let englishForms = 0
for (const [surface, query] of formQueries) {
  const english = isASCII(query)
  if (english) englishForms += 1
  const found = (
    english ? searchEnglish(query) : retrieveJapaneseExamples(query, exampleCorpus)
  ).filter(sentence => usesForm(sentences[sentence].japanese, analysis(sentence), surface))
  if (found.length > 0) formExamples.set(surface, found)
}
log(
  `found examples for ${formExamples.size} of ${formQueries.size} forms ` +
    `(${englishForms} search English)`
)
// The fast search must list exactly what the app's scan lists, on a sample drawn per build.
const formSample = [...formQueries.values()].filter(query => !isASCII(query)).sort()
const checkedForms = new Set<string>()
while (checkedForms.size < Math.min(checkedPerPath, formSample.length)) {
  checkedForms.add(formSample[Math.floor(random() * formSample.length)])
}
for (const query of checkedForms) {
  const fast = JSON.stringify(retrieveJapaneseExamples(query, exampleCorpus))
  if (fast !== JSON.stringify(retrieveJapaneseExamplesByScan(query, sentences))) {
    throw new Error(`The search for the form ${query} differs from the app's scan`)
  }
}
log(`checked ${checkedForms.size} forms' search against the app's scan`)

// Tokens: every listed sentence, on a word page or a form's screen.
const listed = [
  ...new Set([
    ...[...retrieved.values()].flatMap(result => result.sentences),
    ...[...formExamples.values()].flat()
  ])
].sort((a, b) => a - b)
for (const sentence of listed) analysis(sentence)
log(`tokenized ${analyses.size} sentences, of which ${listed.length} are listed`)

// Output: SQL, written as it's made with each INSERT under D1's statement limit, or fixture JSON.
type Value = string | number | boolean | null
const literal = (value: Value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : typeof value === 'boolean'
        ? value
          ? '1'
          : '0'
        : `'${value.replaceAll("'", "''")}'`
const counts: Record<string, number> = {}
const fixtures: Record<string, unknown[]> = {}
let out: number | null = null
let outBytes = 0
let parts = 0
/** Appends a statement to the current SQL file, starting a new one when it's full. */
function writeStatement(statement: string) {
  const bytes = Buffer.byteLength(statement)
  if (out === null || outBytes + bytes > maxFileBytes) {
    if (out !== null) closeSync(out)
    parts += 1
    out = openSync(`${outPath}-${String(parts).padStart(2, '0')}.sql`, 'w')
    outBytes = 0
  }
  writeSync(out, statement)
  outBytes += bytes
}

function writer(table: string, columns: string[]) {
  const head = `INSERT INTO ${table}(${columns.join(', ')}) VALUES `
  const headBytes = Buffer.byteLength(head)
  let batch: string[] = []
  let size = headBytes
  counts[table] = 0
  fixtures[table] = []
  const flush = () => {
    if (batch.length > 0) writeStatement(`${head}${batch.join(',')};\n`)
    batch = []
    size = headBytes
  }
  return {
    add(row: Value[], fixture: unknown) {
      counts[table] += 1
      if (fixtureEntSeqs) {
        fixtures[table].push(fixture)
        return
      }
      const values = `(${row.map(literal).join(',')})`
      const bytes = Buffer.byteLength(values)
      if (headBytes + bytes + 2 > maxStatementBytes) {
        throw new Error(`A ${table} row is over D1's statement limit: ${values.slice(0, 200)}`)
      }
      if (size + bytes + 2 > maxStatementBytes || batch.length === maxStatementRows) flush()
      batch.push(values)
      size += bytes + 1
    },
    flush
  }
}

// Links: each sentence's words first as no page sees them (example_sentences), then on each
// page that lists it (word_examples).
const { lookup, asciiForms } = formLookup(db)
const entryById = new Map(entries.map(entry => [entry.id, entry]))
function entSeq(id: string): number {
  const entry = entryById.get(id)
  if (!entry) throw new Error(`No entry ${id}`)
  return entry.entSeq
}

/** A word with furigana: one with kanji or 々 (JapaneseRubyAnnotation). */
const hasKanji = (text: string) => /[㐀-鿿々]/u.test(text)

function tokenRows(tokens: LinkedToken[]): ExampleSentenceTokenRow[] {
  return tokens.map(token => {
    const row: ExampleSentenceTokenRow = { text: token.surface }
    if (hasKanji(token.surface)) row.reading = toHiragana(token.reading)
    if (token.dictionaryForm !== token.surface) row.dictionaryForm = token.dictionaryForm
    return row
  })
}

/** A page's links: where each word goes, and the furigana the app shows over it. */
function linkRows(tokens: LinkedToken[], rows: ExampleSentenceTokenRow[]): ExampleLinkRow[] {
  const links: ExampleLinkRow[] = []
  for (const [index, token] of tokens.entries()) {
    if (token.entry) {
      const link: ExampleLinkRow = { token: index, entSeqs: [entSeq(token.entry.id)] }
      if (hasKanji(token.surface)) {
        const reading = displayReading(token, entryById.get(token.entry.id) as Entry)
        if (reading !== rows[index].reading) link.reading = reading
      }
      links.push(link)
    } else if (token.candidates.length > 0) {
      links.push({ token: index, entSeqs: token.candidates.map(candidate => entSeq(candidate.id)) })
    }
  }
  return links
}

// The import's own sentence numbers, in pair ID order.
const sentenceIds = new Map(listed.map((sentence, index) => [sentence, index + 1]))
const sentenceRows = new Map<number, ExampleSentenceTokenRow[]>()
const sentenceWriter = writer('example_sentences', [
  'id',
  'pair_id',
  'japanese',
  'english',
  'tokens_json',
  'japanese_tatoeba_id',
  'japanese_contributor',
  'japanese_license',
  'english_tatoeba_id',
  'english_contributor',
  'english_license'
])
// The words as no page sees them, which a form's screen links as they are.
const formSentences = new Set([...formExamples.values()].flat())
const neutralTokens = new Map<number, LinkedToken[]>()
for (const [sentence, id] of sentenceIds) {
  const { japanese, english, pairId, ...row } = sentences[sentence]
  const linked = linkedTokens(japanese, analyses.get(sentence) ?? null, null, lookup)
  if (formSentences.has(sentence)) neutralTokens.set(sentence, linked)
  const tokens = tokenRows(linked)
  sentenceRows.set(sentence, tokens)
  const fixture: ExampleSentenceRow = {
    id,
    pairId,
    japanese,
    english,
    tokens,
    japaneseTatoebaId: row.japaneseTatoebaId,
    japaneseContributor: row.japaneseContributor,
    japaneseLicense: row.japaneseLicense,
    englishTatoebaId: row.englishTatoebaId,
    englishContributor: row.englishContributor,
    englishLicense: row.englishLicense
  }
  sentenceWriter.add(
    [
      id,
      pairId,
      japanese,
      english,
      JSON.stringify(tokens),
      row.japaneseTatoebaId,
      row.japaneseContributor,
      row.japaneseLicense,
      row.englishTatoebaId,
      row.englishContributor,
      row.englishLicense
    ],
    fixture
  )
}
sentenceWriter.flush()
log(`linked ${listed.length} sentences' words`)

// Every ent_seq gets its equivalence group's page, as LookupClient.entry opens it.
const entSeqsByPage = new Map<string, number[]>()
for (const [number, page] of canonical) {
  if (retrieved.has(page.id)) {
    entSeqsByPage.set(page.id, [...(entSeqsByPage.get(page.id) ?? []), number])
  }
}
const exampleWriter = writer('word_examples', [
  'ent_seq',
  'position',
  'sentence_id',
  'highlights_json',
  'links_json',
  'tokens_json'
])
const countWriter = writer('word_example_counts', ['ent_seq', 'listed', 'count', 'truncated'])
let splitOnPage = 0
for (const [id, result] of retrieved) {
  const entry = entryById.get(id) as Entry
  // The page highlights its entry, found by its forms and SearchQuery(entry.headword).
  const highlighted: { entry: HighlightedEntry; query: string } = {
    entry,
    query: normalizeQuery(entry.headword)
  }
  const examples = result.sentences.map(sentence => {
    const { japanese } = sentences[sentence]
    const tokens = linkedTokens(japanese, analyses.get(sentence) ?? null, highlighted, lookup)
    const shared = sentenceRows.get(sentence) as ExampleSentenceTokenRow[]
    // The words are the same on every page, except where a joined word the page's entry is
    // written as stays whole where elsewhere it falls back to its pieces.
    const same =
      tokens.length === shared.length &&
      tokens.every((token, index) => token.surface === shared[index].text)
    const rows = same ? shared : tokenRows(tokens)
    if (!same) splitOnPage += 1
    return {
      sentenceId: sentenceIds.get(sentence) as number,
      highlights: tokens.flatMap((token, index) => (token.entry?.id === id ? [index] : [])),
      links: linkRows(tokens, rows),
      tokens: same ? null : rows
    }
  })
  for (const number of entSeqsByPage.get(id) ?? []) {
    for (const [position, example] of examples.entries()) {
      const fixture: WordExampleRow = { entSeq: number, position, ...example }
      exampleWriter.add(
        [
          number,
          position,
          example.sentenceId,
          JSON.stringify(example.highlights),
          JSON.stringify(example.links),
          example.tokens ? JSON.stringify(example.tokens) : null
        ],
        fixture
      )
    }
    const count: ExampleCountRow = {
      listed: result.sentences.length,
      count: result.count,
      truncated: result.truncated
    }
    countWriter.add([number, count.listed, count.count, count.truncated], {
      entSeq: number,
      ...count
    })
  }
}
exampleWriter.flush()
countWriter.flush()

// Each form's examples as its screen shows them: the sentence's own words, linked as no page
// sees them, with the words that make up the form accented.
const formWriter = writer('form_examples', [
  'surface',
  'position',
  'sentence_id',
  'highlights_json',
  'links_json'
])
for (const [surface, list] of formExamples) {
  const query = formQueries.get(surface) as string
  for (const [position, sentence] of list.entries()) {
    const tokens = neutralTokens.get(sentence) as LinkedToken[]
    const example: FormExampleRow = {
      surface,
      position,
      sentenceId: sentenceIds.get(sentence) as number,
      highlights: queryHighlights(
        sentences[sentence].japanese,
        tokens.map(token => token.surface),
        query
      ),
      links: linkRows(tokens, sentenceRows.get(sentence) as ExampleSentenceTokenRow[])
    }
    formWriter.add(
      [
        surface,
        position,
        example.sentenceId,
        JSON.stringify(example.highlights),
        JSON.stringify(example.links)
      ],
      example
    )
  }
}
formWriter.flush()

// Each word's table, and which of its form screens search engines may index, for the
// conjugations sitemap: one file, like the kanji sitemap.
const conjugationWriter = writer('word_conjugations', ['ent_seq', 'indexed_forms_json'])
let conjugationUrls = 0
for (const [entSeq, table] of [...tables].sort(([a], [b]) => a - b)) {
  const indexed = indexedForms(table, surface => formExamples.has(surface))
  conjugationUrls += 1 + indexed.length
  conjugationWriter.add([entSeq, JSON.stringify(indexed)], { entSeq, indexedForms: indexed })
}
conjugationWriter.flush()
if (conjugationUrls > 50_000) {
  throw new Error(`${conjugationUrls} conjugation pages outgrow one sitemap of 50,000 URLs`)
}
if (out !== null) closeSync(out)
if (fixtureEntSeqs) writeFileSync(outPath, JSON.stringify(fixtures))
// The rows each table should hold once every file is loaded, which the local build checks.
else writeFileSync(`${outPath}-counts.json`, JSON.stringify(counts))
db.close()
// The app looks an ASCII form up in English, which linking doesn't port; no example needs it.
if (asciiForms.size > 0) {
  throw new Error(`Example words the app would look up in English: ${[...asciiForms].join(', ')}`)
}
log(
  `wrote ${JSON.stringify(counts)} in ${parts} files (${splitOnPage} examples split on their ` +
    `own page; ${conjugationUrls} conjugation pages to index); ` +
    `peak ${Math.round(peakRss / 2 ** 20)} MB`
)
