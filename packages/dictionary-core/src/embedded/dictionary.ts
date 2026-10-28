import type { Caption } from '../captions/lines'
import { youTubeCaptions, youTubeTranslatedCaptions, youTubeVideo } from '../captions/youtube'
import { type PhraseEntry, phraseNote } from '../detail/phrase-note'
import { romaji, sentenceRomaji } from '../detail/romaji'
import { isKanjiCharacter } from '../detail/text'
import { progressStats } from '../progress/stats'
import { notesInSearch } from '../results/notes'
import { lookupSegments, type MorphologyAnalysis } from '../search/morphology'
import {
  japaneseCandidates,
  japaneseTextRuns,
  normalizeQuery,
  writtenLanguage
} from '../search/query'
import { creditsShownBy } from '../sources/credits'
import type { EmbeddedHost } from './host'
import { canonicalEntries, EmbeddedLookup } from './lookup'
import { EmbeddedPresentation } from './presentation'
import { type AnalyzeText, EmbeddedText } from './text'

type Outcome = { value: unknown } | { error: string } | { analyze: string }

export interface EmbeddedCall {
  outcome(): string
  value(): string
  analyzed(answerJSON: string): void
}

export interface EmbeddedEndpoint {
  begin(method: string, argument: string): EmbeddedCall
  answer(method: string, argument: string): unknown
  answerJSON(method: string, argument: string): string
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function once<Part>(make: () => Part): () => Part {
  let made: Part | undefined
  return () => {
    made ??= make()
    return made
  }
}

export function embeddedEndpoint(host: EmbeddedHost): EmbeddedEndpoint {
  const lookup = once(() => new EmbeddedLookup(host))
  const text = once(() => new EmbeddedText(host))
  const presentation = once(() => new EmbeddedPresentation(host))
  const methods: Record<string, (argument: string, analyze: AnalyzeText) => unknown> = {
    search: (query, analyze) => lookup().search(query, { analyze }),
    entriesMatchingFirstForms: alternatives =>
      lookup().entriesMatchingFirstForms(JSON.parse(alternatives)),
    entriesContainingKanji: character => lookup().entriesContainingKanji(character),
    websiteRoute: link => lookup().websiteRoute(JSON.parse(link)),
    lookUp: (text, analyze) => lookup().lookUp(text, { analyze }),
    relatedWord: (related, analyze) => lookup().relatedWord(JSON.parse(related), { analyze }),
    savedWord: (saved, analyze) => lookup().savedWord(JSON.parse(saved), { analyze }),
    canonicalEntries: groups => canonicalEntries(JSON.parse(groups)),
    searchedWords: analysis => lookupSegments((JSON.parse(analysis) as MorphologyAnalysis).words),
    normalizeQuery,
    japaneseCandidates: candidates => japaneseCandidates(JSON.parse(candidates)),
    japaneseTextRuns: () => japaneseTextRuns,
    writtenLanguage,
    isKanji: isKanjiCharacter,
    romaji,
    sentenceRomaji: words => sentenceRomaji(JSON.parse(words)),
    checkExamples: () => text().checkExamples(),
    tokenizerReady: () => text().tokenizerReady(),
    exampleCount: query => text().exampleCount(query),
    resultsExampleCount: request => text().resultsExampleCount(JSON.parse(request)),
    resultsExamples: (request, analyze) => text().resultsExamples(JSON.parse(request), analyze),
    entryExamples: (request, analyze) => text().entryExamples(JSON.parse(request), analyze),
    meaningExamples: (request, analyze) => text().meaningExamples(JSON.parse(request), analyze),
    formExamples: (request, analyze) => text().formExamples(JSON.parse(request), analyze),
    linkedTexts: (request, analyze) => text().linkedTexts(JSON.parse(request), analyze),
    countedWords: (lines, analyze) => text().countedWords(JSON.parse(lines), analyze),
    resultsScreen: request => presentation().resultsScreen(JSON.parse(request)),
    wordRows: request => presentation().wordRows(JSON.parse(request)),
    notesInSearch: request => notesInSearch(JSON.parse(request)),
    ruby: pair => presentation().ruby(JSON.parse(pair)),
    wordPage: entry => presentation().wordPage(JSON.parse(entry)),
    wordPageWithoutContent: reading => presentation().wordPageWithoutContent(reading),
    kanjiPageWithoutContent: () => presentation().kanjiPageWithoutContent(),
    kanjiPage: request => presentation().kanjiPage(JSON.parse(request)),
    candidateMeanings: candidates => presentation().candidateMeanings(JSON.parse(candidates)),
    kanjiElementPage: glyph => presentation().kanjiElementPage(glyph),
    kanjiStrokes: row => presentation().kanjiStrokes(JSON.parse(row)),
    radicalPanel: selected => presentation().radicalPanel(JSON.parse(selected)),
    schoolKanjiPanel: request => presentation().schoolKanjiPanel(JSON.parse(request)),
    phraseNote: request => {
      const { phrase, ...entry } = JSON.parse(request) as PhraseEntry & { phrase: string }
      return phraseNote(phrase, entry)
    },
    sourceCredits: creditsShownBy,
    progressStats: request => progressStats(JSON.parse(request)),
    youTubeVideo,
    youTubeCaptions,
    youTubeTranslatedCaptions: request => {
      const { captions, timedText } = JSON.parse(request) as {
        captions: Caption[]
        timedText: string
      }
      return youTubeTranslatedCaptions(captions, timedText)
    }
  }
  const unanalyzed: AnalyzeText = () => {
    throw new Error('An answer asked for at once cannot wait for an analysis')
  }
  const answer = (method: string, argument: string): unknown => {
    const run = Object.hasOwn(methods, method) ? methods[method] : undefined
    if (!run) throw new Error(`The core has no ${method}`)
    const value = run(argument, unanalyzed)
    if (value instanceof Promise) throw new Error(`${method} does not answer at once`)
    return value
  }
  return {
    answer,
    answerJSON: (method, argument) => JSON.stringify(answer(method, argument) ?? null),
    begin(method, argument) {
      const unfinished: Outcome = { error: `${method} did not finish within its call` }
      let outcome: Outcome = unfinished
      let answer: ((answerJSON: string) => void) | undefined
      const analyze: AnalyzeText = sentence =>
        new Promise<MorphologyAnalysis>((resolve, reject) => {
          outcome = { analyze: sentence }
          answer = answerJSON => {
            const { words, pieces, error } = JSON.parse(
              answerJSON
            ) as Partial<MorphologyAnalysis> & {
              error?: string
            }
            if (words) resolve(pieces ? { words, pieces } : { words })
            else reject(new Error(error ?? 'The host returned no words'))
          }
        })
      Promise.resolve()
        .then(() => {
          const run = Object.hasOwn(methods, method) ? methods[method] : undefined
          if (!run) throw new Error(`The core has no ${method}`)
          return run(argument, analyze)
        })
        .then(
          value => {
            outcome = { value }
          },
          error => {
            outcome = { error: message(error) }
          }
        )
      return {
        outcome: () => JSON.stringify(outcome),
        value() {
          if (!('value' in outcome)) throw new Error(`${method} has answered nothing`)
          return JSON.stringify(outcome.value ?? null)
        },
        analyzed(answerJSON) {
          const settle = answer
          if (!settle) throw new Error(`${method} is waiting for no analysis`)
          answer = undefined
          outcome = unfinished
          settle(answerJSON)
        }
      }
    }
  }
}
