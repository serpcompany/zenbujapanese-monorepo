import {
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import type { FrequencyResult, FrequencyRowDetail } from '@zenbu/dictionary-core/detail/frequency'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { type StrokeOrderLabels, strokeOrderLabels } from '@zenbu/dictionary-core/detail/strokes'
import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import type {
  ConjugationsText,
  ShownConjugationRow,
  ShownConjugations
} from '@zenbu/ui/dictionary/conjugations'
import type { ExampleListText } from '@zenbu/ui/dictionary/example-list'
import type { ShownFrequency } from '@zenbu/ui/dictionary/frequency'
import type { ShownFrequencyRow } from '@zenbu/ui/dictionary/frequency-section'
import type { ShownKanjiDetails } from '@zenbu/ui/dictionary/kanji-details'
import type { ShownSourceCredit, SourceCreditsText } from '@zenbu/ui/dictionary/source-credits'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import type { KanjiDetailsData } from './kanji-details'

export function exampleListText(locale: Locale): ExampleListText {
  const { examples, pronounce } = getDictionary(locale)
  return { lang: locale, examples, pronounce }
}

export function conjugationsText(locale: Locale): ConjugationsText {
  return { ...exampleListText(locale), conjugations: getDictionary(locale).conjugations }
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

function shownFrequency(rank: FrequencyResult, locale: Locale): ShownFrequency {
  const text = (value: string) => coreText(value, locale)
  const { spokenTier } = getDictionary(locale).frequency
  return {
    source: rank.source,
    shownSource: text(rank.source),
    value: text(rank.value),
    tier: rank.tier,
    spokenTier: rank.spokenTier ? fill(spokenTier, { tier: text(rank.spokenTier) }) : null
  }
}

export function frequencyBadgesIn(
  frequency: readonly FrequencyResult[],
  locale: Locale
): ShownFrequency[] {
  return frequency.map(rank => shownFrequency(rank, locale))
}

export function frequencyRowsIn(
  rows: readonly FrequencyRowDetail[],
  locale: Locale
): ShownFrequencyRow[] {
  const text = (value: string) => coreText(value, locale)
  return rows.map(row => ({
    ...shownFrequency(row, locale),
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

function shownSourceCredit(source: SourceCredit, locale: Locale): ShownSourceCredit {
  const text = (value: string) => coreText(value, locale)
  return {
    id: source.id,
    name: text(source.name),
    url: source.url,
    credit: text(source.credit),
    license: source.license,
    notice: source.notice ? text(source.notice) : null
  }
}

export function sourceCreditIn(
  source: SourceCredit,
  locale: Locale
): { source: ShownSourceCredit; text: SourceCreditsText } {
  return { source: shownSourceCredit(source, locale), text: getDictionary(locale).sourceCredits }
}

export function sourceCreditsIn(
  sources: readonly SourceCredit[],
  locale: Locale
): { sources: ShownSourceCredit[]; text: SourceCreditsText } {
  return {
    sources: sources.map(source => shownSourceCredit(source, locale)),
    text: getDictionary(locale).sourceCredits
  }
}

export function kanjiDetailsIn(kanji: KanjiDetailsData, locale: Locale): ShownKanjiDetails {
  const text = (value: string) => coreText(value, locale)
  return {
    ...kanji,
    sections: kanji.sections.map(section => ({ ...section, title: text(section.title) })),
    stats: kanji.stats.map(stat => ({ ...stat, label: text(stat.label) })),
    readings: kanji.readings.map(reading => ({
      ...reading,
      label: text(reading.label),
      spoken: reading.spoken ? text(reading.spoken) : null
    })),
    elements: kanji.elements.map(element => ({
      ...element,
      roleLabel: text(element.roleLabel),
      description: element.meanings.length > 0 ? element.description : text(element.description)
    })),
    strokeLabels: kanji.strokeOrder
      ? strokeLabelsIn(kanji.character, kanji.strokeOrder.strokes.length, locale)
      : null
  }
}
