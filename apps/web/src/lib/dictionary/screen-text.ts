import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import type { FrequencyDetails, FrequencyRowDetail } from '@zenbu/dictionary-core/detail/frequency'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { type StrokeOrderLabels, strokeOrderLabels } from '@zenbu/dictionary-core/detail/strokes'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'

export type ExampleListText = Pick<Dictionary, 'examples' | 'pronounce'>

export type ConjugationsText = ExampleListText & Pick<Dictionary, 'conjugations'>

export function exampleListText(locale: Locale): ExampleListText {
  const { examples, pronounce } = getDictionary(locale)
  return { examples, pronounce }
}

export function conjugationsText(locale: Locale): ConjugationsText {
  return { ...exampleListText(locale), conjugations: getDictionary(locale).conjugations }
}

export interface ShownConjugationRow extends Omit<ConjugationRow, 'sharedSpellings'> {
  sharedSpelling: string | null
  romaji: string | null
}

export interface ShownConjugations extends Omit<Conjugations, 'modes' | 'rows'> {
  modes: { mode: ConjugationMode; label: string }[]
  rows: Record<ConjugationMode, ShownConjugationRow[]>
}

export function conjugationsIn(conjugations: Conjugations, locale: Locale): ShownConjugations {
  const text = (value: string) => coreText(value, locale)
  const row = ({ sharedSpellings, ...form }: ConjugationRow): ShownConjugationRow => ({
    ...form,
    title: text(form.title),
    explanation: text(form.explanation),
    pronounce: text(form.pronounce),
    sharedSpelling: sharedSpellings.length > 0 ? text(sharedSpellingNote(sharedSpellings)) : null,
    romaji: romaji(form.reading)
  })
  return {
    title: text(conjugations.title),
    rule: text(conjugations.rule),
    modes: conjugations.modes.map(mode => ({ mode, label: text(mode) })),
    rows: { Plain: conjugations.rows.Plain.map(row), Polite: conjugations.rows.Polite.map(row) },
    examples: {
      title: text(conjugations.examples.title),
      empty: text(conjugations.examples.empty)
    }
  }
}

export interface ShownFrequencyRow {
  source: string
  shownSource: string
  value: string
  tier: FrequencyRowDetail['tier']
  spokenTier: string | null
  label: string
  details: FrequencyDetails & { shownSection: string }
}

export function frequencyRowsIn(
  rows: readonly FrequencyRowDetail[],
  locale: Locale
): ShownFrequencyRow[] {
  const text = (value: string) => coreText(value, locale)
  const { spokenTier } = getDictionary(locale).frequency
  return rows.map(row => ({
    source: row.source,
    shownSource: text(row.source),
    value: text(row.value),
    tier: row.tier,
    spokenTier: row.spokenTier ? fill(spokenTier, { tier: text(row.spokenTier) }) : null,
    label: text(row.label),
    details: {
      pack: {
        name: text(row.details.pack.name),
        domain: text(row.details.pack.domain),
        description: text(row.details.pack.description),
        version: row.details.pack.version,
        source: text(row.details.pack.source)
      },
      section: row.details.section,
      shownSection: text(row.details.section),
      rows: row.details.rows.map(detail => ({
        label: text(detail.label),
        value: text(detail.value)
      })),
      explanation: row.details.explanation === null ? null : text(row.details.explanation)
    }
  }))
}

export function strokeLabelsIn(
  character: string,
  strokeCount: number,
  locale: Locale
): StrokeOrderLabels {
  const text = (value: string) => coreText(value, locale)
  const labels = strokeOrderLabels(character, strokeCount)
  return {
    title: text(labels.title),
    show: text(labels.show),
    grid: text(labels.grid),
    previous: text(labels.previous),
    play: text(labels.play),
    pause: text(labels.pause),
    next: text(labels.next),
    position: labels.position.map(text),
    complete: labels.complete.map(text),
    completeOf: labels.completeOf.map(text),
    drawing: labels.drawing.map(text)
  }
}
