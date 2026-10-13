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
  type ExamplesEntry,
  examplesEntries,
  occurrences,
  tokenSpans
} from '../artifact/word-examples'
import { exampleCountText } from '../detail/examples'
import { type Attachment, attachment } from '../detail/romaji'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { usesForm } from '../examples/forms'
import { ipadicTokenizer } from '../examples/ipadic'
import {
  displayReading,
  formsLookedUp,
  type Highlighted,
  type LinkEntry,
  linkedTokens
} from '../examples/linking'
import {
  isFunctionWord,
  kuromojiCandidates,
  type MorphologyCandidate,
  type Tokenize
} from '../examples/morphology'
import type { SearchDatabase } from '../search/database'
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

interface EmbeddedSentence {
  id: string
  japanese: string
  english: string
}

export interface EmbeddedExamples {
  sentences: EmbeddedSentence[]
  count: number
  truncated: boolean
}

export interface EmbeddedResultsExamples {
  sentences: EmbeddedSentence[]
  countText: string | null
}

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
  isPageWord: boolean
  matchesQuery: boolean
  attaches: Attachment | null
  counted: boolean
}

export interface ResultsExamplesRequest {
  query: string
  primaryEntry: string | null
  usesPrimaryEntryExamples: boolean
}

export interface LinkRequest {
  text: string
  query: string
  highlightedEntry: string | null
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

const listed = (sentences: readonly ExampleSentence[]): EmbeddedSentence[] =>
  sentences.map(({ pairId, japanese, english }) => ({ id: `esp1_${pairId}`, japanese, english }))

function answered(found: EntryExamples | string): EmbeddedExamples {
  if (typeof found === 'string') throw new Error(found)
  return { sentences: listed(found.sentences), count: found.count, truncated: found.truncated }
}

export class EmbeddedText {
  private readonly db: ArtifactDatabase
  private readonly searchDb: SearchDatabase
  private readonly forms = new LruCache<string, LinkEntry[]>(20_000)
  private readonly lookup: FormLookup
  private readonly entries = new LruCache<string, ExamplesEntry>(4_000)
  private readonly linked = new LruCache<string, EmbeddedToken[]>(512)
  private readonly searched = new LruCache<string, EntryExamples | string>(32)
  private readonly retrieved = new LruCache<string, EntryExamples | string>(64)
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

  private retrieve(id: string): EntryExamples | string {
    const cached = this.retrieved.get(id)
    if (cached !== undefined) return cached
    const entry = this.found([id]).get(id)
    const found = entry ? retrieveEntryExamples(this.db, entry) : 'missingEntryEvidence'
    this.retrieved.set(id, found)
    return found
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
    return request.usesPrimaryEntryExamples && request.primaryEntry !== null
      ? this.retrieve(request.primaryEntry)
      : this.search(request.query)
  }

  resultsExampleCount(request: ResultsExamplesRequest): number {
    const found = this.listed(request)
    if (typeof found === 'string') return 0
    return request.usesPrimaryEntryExamples && request.primaryEntry !== null
      ? found.sentences.length
      : found.count
  }

  resultsExamples(request: ResultsExamplesRequest): EmbeddedResultsExamples {
    const found = this.listed(request)
    if (typeof found === 'string') return { sentences: [], countText: null }
    return {
      sentences: listed(found.sentences),
      countText: exampleCountText({ listed: found.sentences.length, truncated: found.truncated })
    }
  }

  entryExamples(id: string): EmbeddedExamples {
    return answered(this.retrieve(id))
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

  async formExamples(form: string, analyze: AnalyzeText): Promise<EmbeddedSentence[]> {
    const found = this.search(form)
    if (typeof found === 'string') return []
    const sentences: ExampleSentence[] = []
    for (const sentence of found.sentences) {
      if (!sentence.japanese.includes(form)) continue
      if (usesForm(sentence.japanese, await this.candidates(sentence.japanese, analyze), form)) {
        sentences.push(sentence)
      }
    }
    return listed(sentences)
  }

  private async prefetch(
    candidates: MorphologyCandidate[],
    highlighted: Highlighted | null
  ): Promise<void> {
    const alternatives = formsLookedUp(candidates, highlighted).map(forms =>
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
    const { text } = request
    const query = normalizeQuery(request.query)
    const key = JSON.stringify([text, query, request.highlightedEntry])
    const known = this.linked.get(key)
    if (known) return known
    const candidates = await this.candidates(text, analyze)
    const entry = request.highlightedEntry
      ? (this.found([request.highlightedEntry]).get(request.highlightedEntry) ?? null)
      : null
    const highlighted = entry ? { entry, query } : null
    if (candidates) await this.prefetch(candidates, highlighted)
    const tokens = linkedTokens(text, candidates, highlighted, this.lookup)
    const linked = this.found(tokens.flatMap(token => (token.entry ? [token.entry.id] : [])))
    const matches = occurrences(text, query)
    const answer = tokenSpans(tokens).map(({ start, end }, index): EmbeddedToken => {
      const token = tokens[index]
      const target = token.entry ? linked.get(token.entry.id) : undefined
      const furigana = target ? displayReading(token, target) : null
      const functionWord = isFunctionWord(token)
      return {
        surface: token.surface,
        start,
        end,
        reading: candidates ? token.reading : null,
        isFunctionWord: functionWord,
        entry: token.entry?.id ?? null,
        candidates: token.entry ? [] : token.candidates.map(candidate => candidate.id),
        furigana,
        ruby: furigana === null ? null : rubySegments(token.surface, furigana),
        isPageWord: entry !== null && token.entry?.id === entry.id,
        matchesQuery: matches.some(match => match.start < end && start < match.end),
        attaches: attachment(token.surface),
        counted: token.entry !== null && !functionWord
      }
    })
    if (candidates) this.linked.set(key, answer)
    return answer
  }
}
