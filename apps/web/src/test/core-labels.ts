import { rankedLists, schoolLists, strokeList } from '@zenbu/dictionary-core/browse/lists'
import {
  type Conjugations,
  conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import {
  exampleCountText,
  examplesTitle,
  noExamplesMessage,
  noFormExamplesMessage
} from '@zenbu/dictionary-core/detail/examples'
import {
  defaultFrequencyPacks,
  type FrequencyRowDetail,
  frequencyLookupChips,
  frequencyLookupRow,
  frequencyRowDetails,
  frequencyUnavailableNotice,
  tierLabels
} from '@zenbu/dictionary-core/detail/frequency'
import { kanjiDetail, kanjiElements, kanjiSections } from '@zenbu/dictionary-core/detail/kanji'
import { kanjiElementDetail } from '@zenbu/dictionary-core/detail/kanji-element'
import { partOfSpeechPhrase } from '@zenbu/dictionary-core/detail/part-of-speech'
import type { FrequencyRow, KanjiRows, WordRows } from '@zenbu/dictionary-core/detail/rows'
import { strokeOrderLabels } from '@zenbu/dictionary-core/detail/strokes'
import { wordDetail, wordSections } from '@zenbu/dictionary-core/detail/word'
import {
  fixtureKanjiRows,
  fixtureSearchOrder,
  fixtureWordRows
} from '@zenbu/dictionary-core/fixtures'
import {
  filterTitles,
  hiddenCountTitle,
  shownCountAnnouncement,
  sortAnnouncement,
  sortSummary
} from '@zenbu/dictionary-core/results/ordering'
import {
  discoveredWordsHeading,
  noMatches,
  readingRefinementSpoken,
  resultsLayout
} from '@zenbu/dictionary-core/results/results'
import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import type { SearchData } from '@/lib/dictionary/data'

export const fixtureQueries = [
  ...new Set([
    ...Object.keys(fixtureSearchOrder),
    ...fixtureWordRows.flatMap(({ entry }) => [entry.headword, entry.reading]),
    ...fixtureKanjiRows.map(({ kanji }) => kanji.character),
    'to be needed',
    'qzxvkj'
  ])
]

export interface Label {
  text: string
  data?: readonly string[]
}

const plain = (texts: readonly (string | null | undefined)[]): Label[] =>
  texts.flatMap(text => (text ? [{ text }] : []))

const partsOfSpeech = [
  'noun',
  'pronoun',
  'nounPrefix',
  'nounSuffix',
  'noAdjective',
  'prenominal',
  'preNounAdjective',
  'iAdjective',
  'naAdjective',
  'taruAdjective',
  'archaicNaAdjective',
  'archaicAdjective',
  'adverb',
  'adverbTo',
  'auxiliary',
  'auxiliaryAdjective',
  'auxiliaryVerb',
  'conjunction',
  'copula',
  'counter',
  'expression',
  'interjection',
  'numeric',
  'prefix',
  'suffix',
  'particle',
  'verb',
  'ichidanVerb',
  'zuruVerb',
  'godanVerb',
  'archaicVerb',
  'kuruVerb',
  'takesSuru',
  'suruVerb'
]

const languageDataLabels = [
  'Usually written in kana',
  'Archaic',
  'Obsolete',
  'Honorific',
  'Humble',
  'Colloquial',
  'Rare',
  'Search only',
  'Irregular kana',
  'Irregular kanji',
  'Irregular okurigana',
  'See also',
  'Related intransitive verb',
  'Related transitive verb'
]

function partOfSpeechLabels(): Label[] {
  const transitivity = [[], ['transitive'], ['intransitive'], ['transitive', 'intransitive']]
  return plain(
    partsOfSpeech.flatMap(part =>
      transitivity.map(modifiers => partOfSpeechPhrase([part, ...modifiers]))
    )
  )
}

function conjugationLabels(table: Conjugations): Label[] {
  const rows = [...table.rows.Plain, ...table.rows.Polite]
  return plain([
    table.title,
    table.rule,
    ...table.modes,
    table.examples.title,
    table.examples.empty,
    ...rows.flatMap(row => [
      row.title,
      row.explanation,
      row.sharedSpellings.length > 0 ? sharedSpellingNote(row.sharedSpellings) : null
    ])
  ]).concat(rows.map(row => ({ text: row.pronounce, data: [row.reading] })))
}

function everyConjugationTable(): Label[] {
  const words: [string, string, string[]][] = [
    ['見る', 'みる', ['ichidanVerb']],
    ['書く', 'かく', ['godanVerb']],
    ['勉強する', 'べんきょうする', ['suruVerb']],
    ['来る', 'くる', ['kuruVerb']],
    ['高い', 'たかい', ['iAdjective']],
    ['静か', 'しずか', ['naAdjective']]
  ]
  return words.flatMap(([headword, reading, parts]) => {
    const table = conjugations({ headword, reading, partsOfSpeech: parts }, new Map())
    return table ? conjugationLabels(table) : []
  })
}

function frequencyLabels(rows: readonly FrequencyRowDetail[]): Label[] {
  return plain(
    rows.flatMap(row => [
      row.source,
      row.value,
      row.spokenTier,
      row.label,
      row.details.pack.name,
      row.details.pack.domain,
      row.details.pack.description,
      row.details.pack.source,
      row.details.section,
      row.details.explanation,
      ...row.details.rows.flatMap(detail => [detail.label, detail.value])
    ])
  )
}

function everyFrequencyLabel(): Label[] {
  const ranks = [1, 2_000, 10_000, 20_000, 40_000]
  const rows: FrequencyRow[][] = [
    [],
    ...[1, 2, 3, 4, 5].map(level => [{ pack: 'jlpt' as const, level }]),
    ...ranks.map(rank => [{ pack: 'tubelex' as const, rank }])
  ]
  const [jlpt, youtube] = defaultFrequencyPacks
  const reason = 'The frequency pack is missing.'
  const unavailable = frequencyLookupRow({ dictionary: youtube, unavailable: reason })
  const missing = [{ dictionary: jlpt, unavailable: reason }]
  return [
    ...rows.flatMap(row => frequencyLabels(frequencyRowDetails(row))),
    ...plain([unavailable.value, unavailable.label, ...Object.values(tierLabels)]),
    ...plain(
      [null, [], [{ dictionary: jlpt, value: null }]].map(
        chips => frequencyLookupChips(chips).spoken
      )
    ),
    ...plain(rankedLists.flatMap(list => [list.name, list.chip])),
    ...plain(schoolLists.map(list => list.name)),
    ...plain([strokeList(1).name, strokeList(12).name]),
    { text: frequencyUnavailableNotice([missing]) ?? '', data: [reason] },
    { text: frequencyUnavailableNotice([[...missing, { dictionary: youtube, value: 1 }]]) ?? '' }
  ]
}

export function wordLabels(rows: WordRows): Label[] {
  const detail = wordDetail(rows)
  const data = [detail.summary, ...detail.senses.map(sense => sense.meaning)]
  return [
    ...plain([
      ...detail.sections.map(section => section.title),
      detail.partOfSpeech,
      detail.partOfSpeechRow,
      exampleCountText(detail.exampleCount),
      ...detail.alternatives.flatMap(form => form.labels),
      ...detail.related.map(related => related.relation),
      ...detail.senses.flatMap(sense =>
        sense.notes.filter(note => languageDataLabels.includes(note))
      )
    ]),
    { text: detail.pronounce, data },
    ...(detail.pitch ? plain([detail.pitch.spoken]) : []),
    ...(detail.conjugations ? conjugationLabels(detail.conjugations) : []),
    ...frequencyLabels(detail.frequencyRows)
  ]
}

const sentence = (texts: readonly string[]) => texts.filter(Boolean)

export function kanjiLabels(rows: KanjiRows): Label[] {
  const detail = kanjiDetail(rows)
  const data = [
    ...detail.meanings,
    ...detail.words.flatMap(word => [word.headword, word.summary]),
    ...detail.elements.flatMap(element => element.meanings)
  ]
  const order = strokeOrderLabels(detail.character, detail.strokeOrder?.strokes.length ?? 1)
  return [
    ...plain([
      ...detail.sections.map(section => section.title),
      ...detail.stats.flatMap(stat => [stat.label, stat.spoken]),
      ...detail.readings.map(reading => reading.label),
      ...detail.elements.flatMap(element => [
        element.roleLabel,
        element.meanings.length > 0 ? null : element.description
      ])
    ]),
    ...sentence([
      ...detail.readings.flatMap(reading => (reading.spoken ? [reading.spoken] : [])),
      ...detail.elements.map(element => element.spoken)
    ]).map(text => ({ text, data })),
    ...plain(Object.values(order).flat())
  ]
}

function everyKanjiLabel(): Label[] {
  const structure = {
    onReadings: ['ニチ'],
    elementGlyphs: ['木', '口', '日'],
    explicitPhoneticElement: '口'
  }
  const elements = kanjiElements(structure, [
    { glyph: '木', meanings: ['tree'], commonLinkedOnReadings: [] },
    { glyph: '口', meanings: [], commonLinkedOnReadings: ['コウ'] },
    { glyph: '日', meanings: [], commonLinkedOnReadings: ['ニチ'] }
  ])
  const page = kanjiElementDetail({
    glyph: '木',
    meanings: ['tree', 'wood'],
    commonLinkedOnReadings: ['モク'],
    alternatives: ['朩'],
    family: [{ character: '木', meanings: ['tree'], onReadings: ['モク'], frequencyRank: 1 }],
    containing: [{ character: '林', meanings: ['grove'], onReadings: ['リン'], frequencyRank: 2 }],
    structureSource: 'Kanjium',
    metadataSource: 'Kanjium'
  })
  const content = { readings: [1], components: [1], elements: [1], words: [1] }
  return [
    ...plain(kanjiSections(content).map(section => section.title)),
    ...plain(page.sections.map(section => section.title)),
    ...plain([page.soundPatterns]),
    { text: page.explanation ?? '', data: page.meanings },
    ...plain(elements.flatMap(element => [element.roleLabel])),
    ...elements.map(element => ({ text: element.spoken, data: element.meanings })),
    ...plain(elements.map(element => (element.meanings.length > 0 ? null : element.description))),
    ...plain(
      Array.from({ length: 30 }, (_, index) =>
        Object.values(strokeOrderLabels('木', index + 1)).flat()
      ).flat()
    )
  ]
}

const emptyResults = (readingRefinement: string | null) => ({
  items: [],
  presentation: 'ranked' as const,
  readingRefinement,
  usesPrimaryEntryExamples: false,
  leadingLexicalEntryCount: 0
})

function everyResultsLabel(): Label[] {
  const layouts = [1, 2, 51, 101].map(count => resultsLayout('いる', emptyResults('いる'), count))
  const sorts = [
    { by: 'relevance' as const },
    { by: 'knownWords' as const },
    { by: 'frequency' as const, family: 'x' }
  ]
  return plain([
    noMatches.title,
    discoveredWordsHeading,
    readingRefinementSpoken('いる'),
    resultsLayout('要', emptyResults(null), 0).kanji?.summary,
    resultsLayout('要', emptyResults(null), 0).kanji?.label,
    ...layouts.flatMap(layout => [layout.examples?.title, layout.readingRefinement?.title]),
    ...Object.values(filterTitles),
    ...sorts.flatMap(sort => [sortSummary(sort, []), sortAnnouncement(sort, [])]),
    ...[1, 3].flatMap(count => [hiddenCountTitle(count), shownCountAnnouncement(count)])
  ])
}

function everyExamplesLabel(): Label[] {
  return plain([
    examplesTitle,
    noExamplesMessage,
    noFormExamplesMessage,
    exampleCountText({ listed: 1, truncated: false }),
    exampleCountText({ listed: 3, truncated: false }),
    exampleCountText({ listed: 100, truncated: true })
  ])
}

function creditLabels(): Label[] {
  const { conversionNotice, credits } = creditsShownBy('website')
  return plain([
    conversionNotice,
    ...credits.flatMap(credit => [credit.name, credit.credit, credit.notice])
  ])
}

const oneKanji = { character: '木', meaning: null }

const everyWordSection: Parameters<typeof wordSections>[0] = {
  alternatives: [{ value: '樹', kind: 'written', labels: [], labelText: null, kanji: '樹' }],
  kanji: [oneKanji],
  alternativeKanji: [oneKanji],
  related: [
    {
      headword: '林',
      reading: 'はやし',
      ruby: [],
      relation: 'See also',
      summary: 'grove',
      description: 'See also · grove',
      entSeq: null
    }
  ]
}

export function everyCoreLabel(): Label[] {
  return [
    ...plain(languageDataLabels),
    ...partOfSpeechLabels(),
    ...plain(
      wordSections(everyWordSection, { frequency: true, conjugations: true }).map(
        section => section.title
      )
    ),
    ...everyConjugationTable(),
    ...everyFrequencyLabel(),
    ...everyKanjiLabel(),
    ...everyResultsLabel(),
    ...everyExamplesLabel(),
    ...creditLabels()
  ]
}

export function searchLabels(data: SearchData): Label[] {
  if (data.state === 'noResults') return plain([noMatches.title])
  const kanji = data.kanji
  return [
    ...plain([
      data.examples?.title,
      data.readingRefinement ? readingRefinementSpoken(data.readingRefinement.query) : null,
      data.kanji?.label,
      ...data.rows.flatMap(row =>
        row.chips.flatMap(chip => [
          chip.source,
          chip.value === '—' ? null : chip.value,
          chip.spokenTier
        ])
      )
    ]),
    ...(kanji ? [{ text: kanji.summary, data: kanji.entryId ? [kanji.summary] : [] }] : [])
  ]
}
