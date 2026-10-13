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
  counted: boolean
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

interface PageRequest {
  from: number
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

export class EmbeddedText {
  private readonly db: ArtifactDatabase
  private readonly searchDb: SearchDatabase
  private readonly forms = new LruCache<string, LinkEntry[]>(20_000)
  private readonly lookup: FormLookup
  private readonly entries = new LruCache<string, ExamplesEntry>(4_000)
  private readonly linked = new LruCache<string, EmbeddedToken[]>(512)
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

  private async page(
    sentences: readonly ExampleSentence[],
    from: number,
    accented: Accented,
    analyze: AnalyzeText
  ): Promise<EmbeddedExamplePage> {
    const examples: EmbeddedExample[] = []
    for (const { pairId, japanese, english } of sentences.slice(from, from + examplesPerPage)) {
      examples.push({
        id: `esp1_${pairId}`,
        japanese,
        english,
        words: await this.link(japanese, accented, analyze)
      })
    }
    return { examples, listed: sentences.length }
  }

  async resultsExamples(
    request: ResultsExamplesRequest & PageRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedResultsExamples> {
    const found = this.listed(request)
    if (typeof found === 'string') return { examples: [], listed: 0, countText: null }
    const accented: Accented = {
      query: request.query,
      entry: request.primaryEntry,
      accent: screenAccent.searchExamples
    }
    return {
      ...(await this.page(found.sentences, request.from, accented, analyze)),
      countText: exampleCountText({ listed: found.sentences.length, truncated: found.truncated })
    }
  }

  async entryExamples(
    { id, from }: { id: string } & PageRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedEntryExamples> {
    const retrieved = this.retrieve(id)
    if (typeof retrieved === 'string') throw new Error(retrieved)
    const { entry, examples } = retrieved
    const accented: Accented = {
      query: entry.headword,
      entry: id,
      accent: screenAccent.wordExamples
    }
    return {
      ...(await this.page(examples.sentences, from, accented, analyze)),
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
    { form, from }: { form: string } & PageRequest,
    analyze: AnalyzeText
  ): Promise<EmbeddedExamplePage> {
    const sentences = await this.sentencesUsing(form, analyze)
    const accented: Accented = { query: form, entry: null, accent: screenAccent.formExamples }
    return this.page(sentences, from, accented, analyze)
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

  linkedTokens(request: LinkRequest, analyze: AnalyzeText): Promise<EmbeddedToken[]> {
    const accented: Accented = {
      query: request.query,
      entry: request.highlightedEntry,
      accent: 'entry'
    }
    return this.link(request.text, accented, analyze)
  }

  private async link(
    text: string,
    accented: Accented,
    analyze: AnalyzeText
  ): Promise<EmbeddedToken[]> {
    const query = normalizeQuery(accented.query)
    const key = JSON.stringify([text, query, accented.entry, accented.accent])
    const known = this.linked.get(key)
    if (known) return known
    const candidates = await this.candidates(text, analyze)
    const entry = accented.entry ? (this.found([accented.entry]).get(accented.entry) ?? null) : null
    const highlighted = entry ? { entry, query } : null
    if (candidates) await this.prefetch(candidates, highlighted)
    const tokens = linkedTokens(text, candidates, highlighted, this.lookup)
    const linked = this.found(tokens.flatMap(token => (token.entry ? [token.entry.id] : [])))
    const accents = new Set(
      accentedPositions(text, tokens, { entry, query, accent: accented.accent })
    )
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
        accent: accents.has(index) ? accented.accent : null,
        attaches: attachment(token.surface),
        counted: token.entry !== null && !functionWord
      }
    })
    if (candidates) this.linked.set(key, answer)
    return answer
  }
}
