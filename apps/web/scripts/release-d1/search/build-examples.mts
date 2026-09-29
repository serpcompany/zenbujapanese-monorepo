// Precomputes example search into the search database (#511): what Search's "View N Example
// Sentences" row counts and its Example Sentences screen lists (ExampleSentenceClient.swift's
// `search`, `count`, and `examples`, SearchView.swift, ExampleSentencesView.swift).
//
//   pnpm exec tsx scripts/release-d1/search/build-examples.mts <LanguageReferenceData.sqlite3> <resources dir> <out prefix>
//
// `resources dir` is the app's SearchExperience/Resources: ExampleWordIndex.sqlite3 and the
// Kuromoji build. Writes SQL files `<out prefix>-01.sql`, `-02.sql`, and so on, each under
// 100 MB, and `<out prefix>-counts.json`, the rows each table should then hold:
//
//   - example_sentences: every Tatoeba pair the app searches (all of them, in pair ID order),
//     with both sides' attribution and its words as Kuromoji splits them and the app links
//     them with no page's entry (`plannedWords`), so a page can link them for its query's entry;
//   - example_english_fts and example_japanese_chars: the full-text indexes that find a query's
//     candidate sentences in place of the app's FTS4 Porter index and `instr` scan;
//   - example_entries: every entry's written and reading forms, which the Example Sentences
//     screen links words to its entry by, and its examples (the app's retrieval for it, as its
//     word page lists them), which a deinflected or romaji search opens;
//   - example_search_cache: the results of every search with more than `exampleCandidateLimit`
//     candidates that can list anything, which the website doesn't run per request.
//
// It checks, and fails on any difference: its FTS4 tokenizers against SQLite's own on every
// sentence, its entry retrieval against the app's scan on a sample of entries, and its planned
// links against `linkedTokens` on a sample of sentences. The search import's gate then checks the
// result against the app-recorded example-search and search-results suites.

import { createHash } from 'node:crypto'
import { closeSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ExampleWordRow } from '../../../src/lib/dictionary/detail/rows'
import { type Fts4Tokenizer, tokenize } from '../../../src/lib/dictionary/examples/fts4'
import { toHiragana } from '../../../src/lib/dictionary/examples/kana'
import { loadKuromoji } from '../../../src/lib/dictionary/examples/kuromoji'
import {
  displayReading,
  type HighlightedEntry,
  linkedTokens,
  linkPlanned,
  type PlannedWord,
  plannedWords
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
  retrieveEntryExamplesByScan
} from '../../../src/lib/dictionary/examples/retrieval'
import {
  type ExampleSearchSource,
  englishTokens,
  exampleCandidateLimit,
  exampleSearchKey,
  japaneseCharacters,
  type SearchSentence,
  searchExamples,
  stemsDocument
} from '../../../src/lib/dictionary/examples/search'
import { normalizeQuery } from '../../../src/lib/dictionary/search/query'
import {
  canonicalEntries,
  corpus,
  type Entry,
  formLookup,
  openArtifact,
  readEntries,
  readForms,
  readSentences,
  readWordIndex
} from '../dictionary/examples-corpus'

/** D1 rejects statements over 100 KB. */
const maxStatementBytes = 90_000
/** A local D1 runs out of memory on an INSERT of about 5,000 rows. */
const maxStatementRows = 500
/** Wrangler drops a local D1 file of 400 MB; 130 MB loads. */
const maxFileBytes = 100_000_000
/** How many entries of each retrieval path, and sentences, are checked against the app's code. */
const checkedPerPath = 40
const checkedSentences = 2_000

const [source, resources, outPath] = process.argv.slice(2)
if (!outPath) {
  throw new Error('usage: build-examples.mts <LanguageReferenceData.sqlite3> <resources dir> <out>')
}

const started = Date.now()
let peakRss = 0
function log(message: string) {
  const rss = process.memoryUsage().rss
  peakRss = Math.max(peakRss, rss)
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  console.error(`search examples: ${seconds} s, ${Math.round(rss / 2 ** 20)} MB: ${message}`)
}

let seed = createHash('sha256')
  .update(process.env.ZENBU_EXAMPLES_SEED ?? 'local')
  .digest()
  .readUInt32BE(0)
/** A seeded xorshift generator, so a build's samples can be drawn again. */
function random(): number {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 2 ** 32
}
function sample<T>(values: T[], count: number): T[] {
  const drawn = new Set<T>()
  while (drawn.size < Math.min(count, values.length)) {
    drawn.add(values[Math.floor(random() * values.length)])
  }
  return [...drawn]
}

// The corpus: every sentence the app searches, numbered from 1 in pair ID order.
const db = openArtifact(source, join(resources, 'ExampleWordIndex.sqlite3'))
const sentences = readSentences(db)
const searchSentences: SearchSentence[] = sentences.map((sentence, index) => ({
  id: index + 1,
  pairId: sentence.pairId,
  japanese: sentence.japanese,
  english: sentence.english
}))
const entries = readEntries(db)
const canonical = canonicalEntries(entries)
const pages = [...new Set(canonical.values())]
const forms = readForms(db, entries)
const wordIndex = readWordIndex(db, sentences)
log(`read ${sentences.length} sentences and ${entries.length} entries`)

// FTS4's tokenizers, checked against SQLite's own on every sentence: the website matches
// English queries with this port.
{
  const sqlite = new DatabaseSync(':memory:')
  for (const tokenizer of ['simple', 'porter'] satisfies Fts4Tokenizer[]) {
    sqlite.exec(`CREATE VIRTUAL TABLE tokens_${tokenizer} USING fts3tokenize(${tokenizer})`)
    // A token's bytes in hex: FTS4 can cut a long word mid-character.
    const statement = sqlite.prepare(
      `SELECT lower(hex(token)) AS token, start, "end" FROM tokens_${tokenizer} WHERE input = ?`
    )
    for (const sentence of sentences) {
      const expected = statement.all(sentence.english) as {
        token: string
        start: number
        end: number
      }[]
      const actual = tokenize(sentence.english, tokenizer)
      const same =
        expected.length === actual.length &&
        expected.every(
          (token, index) =>
            token.token === Buffer.from(actual[index].term, 'latin1').toString('hex') &&
            token.start === actual[index].start &&
            token.end === actual[index].end
        )
      if (!same) {
        throw new Error(
          `The ${tokenizer} tokenizer port differs from SQLite's on "${sentence.english}": ` +
            `${JSON.stringify(expected)} but ${JSON.stringify(actual)}`
        )
      }
    }
  }
  sqlite.close()
}
log('checked the FTS4 tokenizer ports against SQLite on every sentence')

// Each entry's examples, as its word page lists them (build-examples.mts for the dictionary
// database does the same; the word-detail suite checks both).
const terms = new Set<string>()
for (const entry of pages) {
  const found = entryTerms(entry, forms)
  if (typeof found !== 'object') continue
  terms.add(found.selectedForm)
  for (const form of found.alternateForms) terms.add(form)
  terms.add(found.reading)
}
const exampleCorpus = corpus(sentences, forms, findOccurrences(sentences, terms), wordIndex)
const retrieved = new Map<string, RetrievedExamples>()
for (const entry of pages) {
  const result = retrieveEntryExamples(entry, exampleCorpus)
  if (typeof result !== 'string' && result.sentences.length > 0) retrieved.set(entry.id, result)
}
const paths = new Map<string, Entry[]>()
for (const entry of pages) {
  const found = entryTerms(entry, forms)
  const path =
    typeof found === 'string'
      ? found
      : retrieved.get(entry.id)?.truncated
        ? 'written, over 100'
        : 'written'
  paths.set(path, [...(paths.get(path) ?? []), entry])
}
for (const [, candidates] of [...paths].sort(([a], [b]) => (a < b ? -1 : 1))) {
  for (const entry of sample(candidates, checkedPerPath)) {
    const fast = JSON.stringify(retrieveEntryExamples(entry, exampleCorpus))
    if (fast !== JSON.stringify(retrieveEntryExamplesByScan(entry, exampleCorpus))) {
      throw new Error(`Retrieval for ${entry.entSeq} differs from the app's scan`)
    }
  }
}
log(`retrieved examples for ${retrieved.size} entries`)

// Every sentence's words through the app's Kuromoji, planned as no page links them.
const kuromoji = loadKuromoji(join(resources, 'Kuromoji'))
const { lookup, asciiForms } = formLookup(db)
const entryById = new Map(entries.map(entry => [entry.id, entry]))
const entSeq = (id: string) => {
  const entry = entryById.get(id)
  if (!entry) throw new Error(`No entry ${id}`)
  return entry.entSeq
}
const hasKanji = (text: string) => /[㐀-鿿々]/u.test(text)
const analyses: (MorphologyCandidate[] | null)[] = []
const plans: PlannedWord[][] = []
for (const { japanese } of sentences) {
  const analysis = kuromojiCandidates(japanese, kuromoji(japanese))
  analyses.push(analysis)
  plans.push(plannedWords(japanese, analysis, lookup))
}
log(`tokenized and planned ${sentences.length} sentences`)

/** A planned word as `example_sentences.words_json` stores it. */
function wordRow(word: PlannedWord): ExampleWordRow {
  if (word.normalizedForm !== word.dictionaryForm) {
    throw new Error(`${word.surface}'s normalized form isn't its dictionary form`)
  }
  const row: ExampleWordRow = { n: word.surface.length }
  if (hasKanji(word.surface)) row.r = toHiragana(word.reading)
  if (word.dictionaryForm !== word.surface) row.d = word.dictionaryForm
  if (word.candidates.length > 0) {
    row.e = word.candidates.map(candidate => entSeq(candidate.id))
    if (word.candidates.length === 1 && hasKanji(word.surface)) {
      const reading = displayReading(word, entryById.get(word.candidates[0].id) as Entry)
      if (reading !== row.r) row.f = reading
    }
  }
  if (word.pieces) row.p = word.pieces.map(wordRow)
  if (word.unanalyzed) row.u = 1
  return row
}

// The plans must link as `linkedTokens` does, for any page's entry: checked on a sample of
// sentences, each with an entry whose form it contains.
const highlightable = new Map(pages.map(entry => [entry.id, entry]))
for (const index of sample(
  sentences.map((_, index) => index),
  checkedSentences
)) {
  const { japanese } = sentences[index]
  // The entry of the first word with any, so the entry claims words it would otherwise share.
  const words = linkedTokens(japanese, analyses[index], null, lookup)
  const claimed = words.find(word => word.candidates.some(({ id }) => highlightable.has(id)))
  const entry = claimed
    ? (highlightable.get(
        claimed.candidates.find(({ id }) => highlightable.has(id))?.id ?? ''
      ) as Entry)
    : null
  const highlighted = entry
    ? { entry: entry as HighlightedEntry, query: normalizeQuery(entry.headword) }
    : null
  const describe = (tokens: ReturnType<typeof linkedTokens>) =>
    JSON.stringify(
      tokens.map(token => [token.surface, token.candidates.map(candidate => candidate.id)])
    )
  const expected = describe(linkedTokens(japanese, analyses[index], highlighted, lookup))
  const actual = describe(linkPlanned(plans[index], highlighted))
  if (expected !== actual) {
    throw new Error(`Planned links for "${japanese}" differ: ${expected} but ${actual}`)
  }
}
log(`checked planned links against linkedTokens on ${checkedSentences} sentences`)

// The broad searches: every query that can list anything and has more candidates than the
// website reads per request. An English query can list only when some sentence has its exact
// words, so every such query is a run of a sentence's words; a Japanese one is a substring.
const byStem = new Map<string, number[]>()
for (const [index, sentence] of searchSentences.entries()) {
  for (const term of new Set(englishTokens(sentence).porter.map(token => token.term))) {
    const list = byStem.get(term)
    if (list) list.push(index)
    else byStem.set(term, [index])
  }
}
const byCharacter = new Map<string, number[]>()
for (const [index, { japanese }] of searchSentences.entries()) {
  for (const character of new Set(japanese)) {
    const list = byCharacter.get(character)
    if (list) list.push(index)
    else byCharacter.set(character, [index])
  }
}
const memory: ExampleSearchSource = {
  async english(phrase) {
    // Sentences with the phrase's rarest whole word; any word when every one is a prefix.
    const whole = phrase.filter(token => !token.isPrefix)
    if (whole.length === 0) return searchSentences
    const lists = whole.map(token => byStem.get(token.term) ?? [])
    const rarest = lists.reduce((min, list) => (list.length < min.length ? list : min))
    return rarest.map(index => searchSentences[index])
  },
  async japanese(text) {
    const lists = [...text].map(character => byCharacter.get(character) ?? [])
    const rarest = lists.reduce((min, list) => (list.length < min.length ? list : min))
    return rarest
      .filter(index => searchSentences[index].japanese.includes(text))
      .map(index => searchSentences[index])
  }
}

/** Sentences holding each run of `n` items, for every run whose shorter runs are frequent. */
function frequentRuns<T>(
  sequences: T[][],
  key: (items: T[]) => string,
  frequentShorter: Set<string> | null,
  n: number
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const items of sequences) {
    const seen = new Set<string>()
    for (let start = 0; start + n <= items.length; start++) {
      const run = items.slice(start, start + n)
      if (
        frequentShorter &&
        (!frequentShorter.has(key(run.slice(0, -1))) || !frequentShorter.has(key(run.slice(1))))
      ) {
        continue
      }
      seen.add(key(run))
    }
    for (const run of seen) counts.set(run, (counts.get(run) ?? 0) + 1)
  }
  return counts
}

/** Every run of items, of any length, held by more than `exampleCandidateLimit` sentences. */
function frequent<T>(sequences: T[][], key: (items: T[]) => string): Set<string> {
  const all = new Set<string>()
  let previous: Set<string> | null = null
  for (let n = 1; ; n++) {
    const counts: Map<string, number> = frequentRuns(sequences, key, previous, n)
    const found: Set<string> = new Set(
      [...counts].filter(([, count]) => count > exampleCandidateLimit).map(([run]) => run)
    )
    if (found.size === 0) break
    for (const run of found) all.add(run)
    previous = found
  }
  return all
}

const stemKey = (terms: string[]) => terms.join(' ')
const porterStems = searchSentences.map(sentence =>
  englishTokens(sentence).porter.map(token => token.term)
)
const frequentStems = frequent(porterStems, stemKey)
// The runs of a sentence's exact words whose stems are frequent, as queries.
const broadQueries = new Set<string>()
const stemOf = (term: string) => tokenize(term, 'porter')[0]?.term ?? ''
for (const sentence of searchSentences) {
  const words = englishTokens(sentence).simple.map(token => token.term)
  for (let start = 0; start < words.length; start++) {
    for (let end = start + 1; end <= words.length; end++) {
      const run = words.slice(start, end)
      // Only ASCII words, without NUL, can be a plain English query.
      const ascii = (word: string) =>
        [...word].every(byte => byte.charCodeAt(0) > 0 && byte.charCodeAt(0) < 0x80)
      if (!run.every(ascii)) break
      if (!frequentStems.has(stemKey(run.map(stemOf)))) break
      broadQueries.add(run.join(' '))
    }
  }
}
const englishBroad = broadQueries.size
for (const run of frequent(
  searchSentences.map(sentence => [...sentence.japanese]),
  characters => characters.join('')
)) {
  broadQueries.add(run)
}
log(
  `found ${englishBroad} English and ${broadQueries.size - englishBroad} Japanese searches ` +
    `with more than ${exampleCandidateLimit} candidates`
)

const cached = new Map<string, Awaited<ReturnType<typeof searchExamples>>>()
for (const query of broadQueries) {
  const key = exampleSearchKey(query)
  if (cached.has(key)) continue
  cached.set(key, await searchExamples(query, memory))
}
log(`precomputed ${cached.size} broad searches`)

// Output: SQL, written as it's made with each INSERT under D1's statement limit.
type Value = string | number | null
const literal = (value: Value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`
const counts: Record<string, number> = {}
let out: number | null = null
let outBytes = 0
let parts = 0
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
  const flush = () => {
    if (batch.length > 0) writeStatement(`${head}${batch.join(',')};\n`)
    batch = []
    size = headBytes
  }
  return {
    add(row: Value[]) {
      counts[table] += 1
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

const sentenceWriter = writer('example_sentences', [
  'id',
  'pair_id',
  'japanese',
  'english',
  'words_json',
  'japanese_tatoeba_id',
  'japanese_contributor',
  'japanese_license',
  'english_tatoeba_id',
  'english_contributor',
  'english_license'
])
const englishWriter = writer('example_english_fts', ['rowid', 'stems'])
const japaneseWriter = writer('example_japanese_chars', ['rowid', 'chars'])
for (const [index, sentence] of sentences.entries()) {
  const { id } = searchSentences[index]
  sentenceWriter.add([
    id,
    sentence.pairId,
    sentence.japanese,
    sentence.english,
    JSON.stringify(plans[index].map(wordRow)),
    sentence.japaneseTatoebaId,
    sentence.japaneseContributor,
    sentence.japaneseLicense,
    sentence.englishTatoebaId,
    sentence.englishContributor,
    sentence.englishLicense
  ])
  englishWriter.add([id, stemsDocument(englishTokens(searchSentences[index]).porter)])
  japaneseWriter.add([id, japaneseCharacters(sentence.japanese).join(' ')])
}
sentenceWriter.flush()
englishWriter.flush()
japaneseWriter.flush()

const entryWriter = writer('example_entries', [
  'entry_id',
  'ent_seq',
  'written_forms_json',
  'reading_forms_json',
  'sentence_ids_json'
])
for (const entry of entries) {
  // An entry opens its equivalence group's page, as LookupClient.entry does.
  const page = canonical.get(entry.entSeq) as Entry
  const examples = retrieved.get(page.id)
  entryWriter.add([
    entry.id,
    entry.entSeq,
    JSON.stringify(entry.writtenForms),
    JSON.stringify(entry.readingForms),
    examples ? JSON.stringify(examples.sentences.map(index => index + 1)) : null
  ])
}
entryWriter.flush()

const cacheWriter = writer('example_search_cache', [
  'key',
  'count',
  'truncated',
  'sentence_ids_json'
])
for (const [key, result] of cached) {
  cacheWriter.add([key, result.count, result.truncated ? 1 : 0, JSON.stringify(result.ids)])
}
cacheWriter.flush()
if (out !== null) closeSync(out)
writeFileSync(`${outPath}-counts.json`, JSON.stringify(counts))
db.close()
if (asciiForms.size > 0) {
  throw new Error(`Example words the app would look up in English: ${[...asciiForms].join(', ')}`)
}
log(`wrote ${JSON.stringify(counts)} in ${parts} files; peak ${Math.round(peakRss / 2 ** 20)} MB`)
