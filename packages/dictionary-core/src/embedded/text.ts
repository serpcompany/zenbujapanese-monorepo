import { LruCache } from '../artifact/cache'
import { type ArtifactDatabase, checkExamples, searchDatabase } from '../artifact/database'
import {
  type EntryExamples,
  type ExampleSentence,
  retrieveEntryExamples
} from '../artifact/example-retrieval'
import { searchExamples } from '../artifact/example-search'
import { type FormLookup, formLookup } from '../artifact/lookup'
import {
  accentedPositions,
  type ExampleHighlight,
  type ExamplesEntry,
  exampleCount,
  examplesEntries,
  screenAccent,
  tokenSpans
} from '../artifact/word-examples'
import { exampleCountText, examplesPerPage } from '../detail/examples'
import { type Attachment, attachment } from '../detail/romaji'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { usesForm } from '../examples/forms'
import { ipadicTokenizer } from '../examples/ipadic'
import {
  displayReading,
  formsLookedUp,
  type LinkEntry,
  type LinkedToken,
  linkedTokens
} from '../examples/linking'
import {
  isFunctionWord,
  kuromojiCandidates,
  type MorphologyCandidate,
  type Tokenize
} from '../examples/morphology'
import { type SearchDatabase, stopIfInterrupted } from '../search/database'
import type { MorphologyWord } from '../search/morphology'
import { isASCII, normalizeQuery } from '../search/query'
import { type EmbeddedHost, hostDatabase } from './host'
import { entriesMatchingFirstForms } from './lookup'

export interface HostWord extends MorphologyWord {
  normalizedForm?: string
  reading?: string
  children?: HostWord[]
}

export type AnalyzeText = (text: string) => Promise<HostWord[]>

type Accent = ExampleHighlight['accent']

export interface EmbeddedToken {
  surface: string
  start: number
  end: number
  reading: string | null
  isFunctionWord: boolean
  entry: string | null
  candidates: string[]
  furigana: string | null
  ruby: RubySegment[] | null
  accent: Accent | null
  attaches: Attachment | null
}

export interface EmbeddedExample {
  id: string
  japanese: string
  english: string
  words: EmbeddedToken[]
}

export interface EmbeddedExamplePage {
  examples: EmbeddedExample[]
  listed: number
  cutShort: boolean
}

export interface EmbeddedResultsExamples extends EmbeddedExamplePage {
  countText: string | null
}

export interface EmbeddedEntryExamples extends EmbeddedExamplePage {
  count: number
  truncated: boolean
}

interface ResultsExamplesRequest {
  query: string
  primaryEntry: string | null
  usesPrimaryEntryExamples: boolean
}

interface BatchRequest {
  from: number
  limit?: number | null
}

interface LinkRequest {
  text: string
  query: string
  highlightedEntry: string | null
}

interface Accented {
  query: string
  entry: string | null
  accent: Accent
}

function hostCandidate(word: HostWord): MorphologyCandidate {
  return {
    surface: word.surface,
    dictionaryForm: word.dictionaryForm,
    normalizedForm: word.normalizedForm ?? word.dictionaryForm,
    reading: word.reading ?? word.surface,
    partOfSpeech: [...word.partOfSpeech],
    isOutOfVocabulary: word.isOutOfVocabulary,
    children: (word.children ?? []).map(hostCandidate),
    joinsInflection: false
  }
}

const countsTowardComprehension = (
  token: LinkedToken
): token is LinkedToken & { entry: LinkEntry } => token.entry !== null && !isFunctionWord(token)

export class EmbeddedText {
  private readonly db: ArtifactDatabase
  private readonly searchDb: SearchDatabase
  private readonly forms = new LruCache<string, LinkEntry[]>(20_000)
  private readonly lookup: FormLookup
  private readonly entries = new LruCache<string, ExamplesEntry>(4_000)
  private readonly linked = new LruCache<string, EmbeddedToken[]>(512)
  private readonly counted = new LruCache<string, readonly string[]>(4_000)
  private readonly searched = new LruCache<string, EntryExamples | string>(32)
  private readonly retrieved = new LruCache<string, EntryExamples | string>(64)
  private readonly usingForm = new LruCache<string, ExampleSentence[]>(32)
  private readonly tokenize: Tokenize | undefined
  private readonly readsItsFiles: boolean

  constructor(host: EmbeddedHost) {
    this.db = hostDatabase(host)
    this.searchDb = searchDatabase(this.db)
    this.lookup = formLookup(this.db, this.forms)
    this.readsItsFiles = !host.tokenize && host.tokenizerFile !== undefined
    this.tokenize = host.tokenize
      ? text => host.tokenize?.(text) ?? []
      : host.tokenizerFile &&
        ipadicTokenizer(file => {
          const bytes = host.tokenizerFile?.(file)
          if (!bytes) throw new Error(`The host has no ${file} for the tokenizer`)
          return bytes
        })
  }

  private found(ids: readonly string[]): Map<string, ExamplesEntry> {
    const found = new Map<string, ExamplesEntry>()
    const unread: string[] = []
    for (const id of new Set(ids)) {
      const cached = this.entries.get(id)
      if (cached) found.set(id, cached)
      else unread.push(id)
    }
    for (const [id, entry] of examplesEntries(this.db, unread)) {
      this.entries.set(id, entry)
      found.set(id, entry)
    }
    return found
  }

  private search(query: string): EntryExamples | string {
    const normalized = normalizeQuery(query)
    const cached = this.searched.get(normalized)
    if (cached !== undefined) return cached
    const found = searchExamples(this.db, normalized)
    this.searched.set(normalized, found)
    return found
  }

  private retrieve(id: string): { entry: ExamplesEntry; examples: EntryExamples } | string {
    const entry = this.found([id]).get(id)
    if (!entry) return 'missingEntryEvidence'
    const cached = this.retrieved.get(id)
    const examples = cached ?? retrieveEntryExamples(this.db, entry)
    if (cached === undefined) this.retrieved.set(id, examples)
    return typeof examples === 'string' ? examples : { entry, examples }
  }

  checkExamples(): boolean {
    checkExamples(this.db)
    return true
  }

  tokenizerReady(): boolean {
    if (!this.readsItsFiles) return this.tokenize !== undefined
    try {
      return this.tokenize?.('') !== undefined
    } catch {
      return false
    }
  }

  exampleCount(query: string): number {
    const found = this.search(query)
    return typeof found === 'string' ? 0 : found.count
  }

  private listed(request: ResultsExamplesRequest): EntryExamples | string {
    if (!request.usesPrimaryEntryExamples || request.primaryEntry === null) {
      return this.search(request.query)
    }
    const retrieved = this.retrieve(request.primaryEntry)
    return typeof retrieved === 'string' ? retrieved : retrieved.examples
  }

  resultsExampleCount(request: ResultsExamplesRequest): number {
    const found = this.listed(request)
    if (typeof found === 'string') return 0
    return request.usesPrimaryEntryExamples && request.primaryEntry !== null
      ? found.sentences.length
      : found.count
  }

  private async batch(
    sentences: readonly ExampleSentence[],
    { from, limit }: BatchRequest,
    accented: Accented,
    analyze: AnalyzeText
  ): Promise<EmbeddedExamplePage> {
    const nextPage = (Math.floor(from / examplesPerPage) + 1) * examplesPerPage
    const pageEnd = Math.min(sentences.length, nextPage)
    const end = limit && limit > 0 ? Math.min(pageEnd, from + limit) : pageEnd
    const shown = sentences.slice(from, end)
    const linked = await this.link(
      shown.map(sentence => sentence.japanese),
      accented,
      analyze
    )
    return {
      examples: shown.map(({ pairId, japanese, english }, index) => ({
        id: `esp1_${pairId}`,
        japanese,
        english,
        words: linked[index]
      })),
      listed: sentences.length,
      cutShort: end < pageEnd
    }
  }

  async resultsExamples(
    request: ResultsExamplesRequest & BatchRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedResultsExamples> {
    const found = this.listed(request)
    if (typeof found === 'string') {
      return { examples: [], listed: 0, cutShort: false, countText: null }
    }
    const accented: Accented = {
      query: request.query,
      entry: request.primaryEntry,
      accent: screenAccent.searchExamples
    }
    return {
      ...(await this.batch(found.sentences, request, accented, analyze)),
      countText: exampleCountText(exampleCount(found))
    }
  }

  async entryExamples(
    request: { id: string } & BatchRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedEntryExamples> {
    const { id } = request
    const retrieved = this.retrieve(id)
    if (typeof retrieved === 'string') throw new Error(retrieved)
    const { entry, examples } = retrieved
    const accented: Accented = {
      query: entry.headword,
      entry: id,
      accent: screenAccent.wordExamples
    }
    return {
      ...(await this.batch(examples.sentences, request, accented, analyze)),
      count: examples.count,
      truncated: examples.truncated
    }
  }

  private async candidates(
    text: string,
    analyze: AnalyzeText
  ): Promise<MorphologyCandidate[] | null> {
    try {
      if (this.tokenize) return kuromojiCandidates(text, this.tokenize(text))
      return (await analyze(text)).map(hostCandidate)
    } catch {
      return null
    }
  }

  private async sentencesUsing(form: string, analyze: AnalyzeText): Promise<ExampleSentence[]> {
    const known = this.usingForm.get(form)
    if (known) return known
    const found = this.search(form)
    if (typeof found === 'string') return []
    const sentences: ExampleSentence[] = []
    let everySentenceWasAnalyzed = true
    for (const sentence of found.sentences) {
      if (!sentence.japanese.includes(form)) continue
      const candidates = await this.candidates(sentence.japanese, analyze)
      if (candidates === null) everySentenceWasAnalyzed = false
      if (usesForm(sentence.japanese, candidates, form)) sentences.push(sentence)
    }
    if (everySentenceWasAnalyzed) this.usingForm.set(form, sentences)
    return sentences
  }

  async formExamples(
    request: { form: string } & BatchRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedExamplePage> {
    const { form } = request
    const sentences = await this.sentencesUsing(form, analyze)
    const accented: Accented = { query: form, entry: null, accent: screenAccent.formExamples }
    return this.batch(sentences, request, accented, analyze)
  }

  private async prefetch(looked: readonly string[][]): Promise<void> {
    const alternatives = looked.map(forms =>
      forms.filter(form => {
        if (this.forms.get(form) !== undefined) return true
        const query = normalizeQuery(form)
        if (query !== '' && !isASCII(query)) return true
        this.forms.set(form, [])
        return false
      })
    )
    await entriesMatchingFirstForms(this.searchDb, alternatives, this.forms)
  }

  async linkedTokens(request: LinkRequest, analyze: AnalyzeText): Promise<EmbeddedToken[]> {
    const accented: Accented = {
      query: request.query,
      entry: request.highlightedEntry,
      accent: 'entry'
    }
    const [linked] = await this.link([request.text], accented, analyze)
    return linked
  }

  private async link(
    texts: readonly string[],
    accented: Accented,
    analyze: AnalyzeText
  ): Promise<EmbeddedToken[][]> {
    const query = normalizeQuery(accented.query)
    const key = (text: string) => JSON.stringify([text, query, accented.entry, accented.accent])
    const answers = new Map<string, EmbeddedToken[]>()
    const unlinked = new Map<string, MorphologyCandidate[] | null>()
    for (const text of texts) {
      const known = this.linked.get(key(text))
      if (known) answers.set(text, known)
      else if (!unlinked.has(text)) unlinked.set(text, await this.candidates(text, analyze))
    }
    if (unlinked.size > 0) {
      const entry = accented.entry
        ? (this.found([accented.entry]).get(accented.entry) ?? null)
        : null
      const highlighted = entry ? { entry, query } : null
      const looked: string[][] = []
      for (const candidates of unlinked.values()) {
        if (candidates)
          for (const forms of formsLookedUp(candidates, highlighted)) looked.push(forms)
      }
      await this.prefetch(looked)
      const tokens = new Map<string, LinkedToken[]>()
      const named: string[] = []
      for (const [text, candidates] of unlinked) {
        const linked = linkedTokens(text, candidates, highlighted, this.lookup)
        tokens.set(text, linked)
        for (const token of linked) if (token.entry) named.push(token.entry.id)
      }
      const entries = this.found(named)
      const highlight = { entry, query, accent: accented.accent }
      for (const [text, candidates] of unlinked) {
        const answer = words(text, tokens.get(text) ?? [], candidates !== null, entries, highlight)
        if (candidates) this.linked.set(key(text), answer)
        answers.set(text, answer)
      }
    }
    return texts.map(text => answers.get(text) ?? [])
  }

  async countedWords(lines: readonly string[], analyze: AnalyzeText): Promise<string[]> {
    const words = new Map<string, readonly string[]>()
    const analyses = new Map<string, MorphologyCandidate[] | null>()
    const looked: string[][] = []
    for (const text of lines) {
      stopIfInterrupted(this.db, 0)
      if (words.has(text) || analyses.has(text)) continue
      const remembered = this.counted.get(text)
      if (remembered !== undefined) {
        words.set(text, remembered)
        continue
      }
      const candidates = await this.candidates(text, analyze)
      analyses.set(text, candidates)
      if (candidates) for (const forms of formsLookedUp(candidates, null)) looked.push(forms)
    }
    await this.prefetch(looked)
    for (const [text, candidates] of analyses) {
      stopIfInterrupted(this.db, 0)
      const ids: string[] = []
      for (const token of linkedTokens(text, candidates, null, this.lookup)) {
        if (countsTowardComprehension(token)) ids.push(token.entry.id)
      }
      if (candidates) this.counted.set(text, ids)
      words.set(text, ids)
    }
    const counted: string[] = []
    for (const text of lines) {
      for (const id of words.get(text) ?? []) counted.push(id)
    }
    return counted
  }
}

function words(
  text: string,
  tokens: readonly LinkedToken[],
  analyzed: boolean,
  entries: ReadonlyMap<string, ExamplesEntry>,
  highlight: ExampleHighlight
): EmbeddedToken[] {
  const accents = new Set(accentedPositions(text, tokens, highlight))
  return tokenSpans(tokens).map(({ start, end }, index): EmbeddedToken => {
    const token = tokens[index]
    const target = token.entry ? entries.get(token.entry.id) : undefined
    const furigana = target ? displayReading(token, target) : null
    return {
      surface: token.surface,
      start,
      end,
      reading: analyzed ? token.reading : null,
      isFunctionWord: isFunctionWord(token),
      entry: token.entry?.id ?? null,
      candidates: token.entry ? [] : token.candidates.map(candidate => candidate.id),
      furigana,
      ruby: furigana === null ? null : rubySegments(token.surface, furigana),
      accent: accents.has(index) ? highlight.accent : null,
      attaches: attachment(token.surface)
    }
  })
}
