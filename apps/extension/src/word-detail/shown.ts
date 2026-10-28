import {
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import {
  type Example,
  exampleCountText,
  noExamplesMessage
} from '@zenbu/dictionary-core/detail/examples'
import type { FrequencyRowDetail } from '@zenbu/dictionary-core/detail/frequency'
import type { KanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { strokeOrderLabels } from '@zenbu/dictionary-core/detail/strokes'
import { fill } from '@zenbu/dictionary-core/detail/template'
import type { WordDetail, WordKanji } from '@zenbu/dictionary-core/detail/word'
import type { ShownConjugationRow, ShownConjugations } from '@zenbu/ui/dictionary/conjugations'
import type { ShownFrequencyRow } from '@zenbu/ui/dictionary/frequency-section'
import type { ShownKanjiDetails } from '@zenbu/ui/dictionary/kanji-details'
import type { ShownWordSections } from '@zenbu/ui/dictionary/word-sections'
import { wordDetailLabels } from './labels'

const leftOutSections = new Set(['conjugations', 'lists', 'notes'])

function conjugatedForm({ sharedSpellings, ...form }: ConjugationRow): ShownConjugationRow {
  return {
    ...form,
    sharedSpelling: sharedSpellings.length > 0 ? sharedSpellingNote(sharedSpellings) : null,
    romaji: romaji(form.reading)
  }
}

export function shownConjugations(table: Conjugations): ShownConjugations {
  return {
    ...table,
    modes: table.modes.map(mode => ({ mode, label: mode })),
    rows: {
      Plain: table.rows.Plain.map(conjugatedForm),
      Polite: table.rows.Polite.map(conjugatedForm)
    }
  }
}

function frequencyRow(row: FrequencyRowDetail): ShownFrequencyRow {
  const { spokenTier } = wordDetailLabels.frequency
  return {
    ...row,
    shownSource: row.source,
    spokenTier: row.spokenTier ? fill(spokenTier, { tier: row.spokenTier }) : null,
    details: { ...row.details, shownSection: row.details.section }
  }
}

function chosenFrequencyRows(
  rows: readonly FrequencyRowDetail[],
  chosen: readonly string[]
): ShownFrequencyRow[] {
  return chosen.flatMap(pack => rows.filter(row => row.pack === pack)).map(frequencyRow)
}

const kanjiRows = (kanji: readonly WordKanji[]) => kanji.map(item => ({ ...item, details: null }))

export function shownWordSections(
  detail: WordDetail,
  chosen: readonly string[]
): ShownWordSections<Example> {
  const { formLabels, labelSeparator } = wordDetailLabels.word
  const frequencyRows = chosenFrequencyRows(detail.frequencyRows, chosen)
  return {
    sections: detail.sections.filter(
      section =>
        !leftOutSections.has(section.kind) &&
        (section.kind !== 'frequency' || frequencyRows.length > 0)
    ),
    senses: detail.senses.map(sense => ({
      number: sense.number,
      meaning: sense.meaning,
      notes: sense.noteText ? sense.notes.map(note => ({ text: note, source: true })) : [],
      example: sense.example
    })),
    frequencyRows,
    alternatives: detail.alternatives.map(form => ({
      ...form,
      labels:
        form.labels.length > 0
          ? fill(formLabels, { labels: form.labels.join(labelSeparator) })
          : null
    })),
    kanji: kanjiRows(detail.kanji),
    alternativeKanji: kanjiRows(detail.alternativeKanji),
    related: detail.related,
    examples:
      detail.exampleCount && detail.examples.length > 0
        ? { count: exampleCountText(detail.exampleCount) }
        : { empty: noExamplesMessage }
  }
}

export function shownKanjiDetails(detail: KanjiDetail, strokesReady: boolean): ShownKanjiDetails {
  const strokeOrder = strokesReady ? detail.strokeOrder : null
  return {
    ...detail,
    sections: detail.sections.filter(section => !leftOutSections.has(section.kind)),
    components: detail.components.map(character => ({ character })),
    strokeOrder,
    strokeLabels: strokeOrder
      ? strokeOrderLabels(detail.character, strokeOrder.strokes.length)
      : null
  }
}
