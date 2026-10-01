import {
  type ConjugatedForm,
  type ConjugationKind,
  type ConjugationMode,
  type ConjugationTable,
  conjugationTable,
  formsFor,
  supportsModes
} from './conjugation-table'
import { type KanjiReadings, withKanjiReadings } from './kanji-split'
import type { EntryRow } from './rows'
import { type RubySegment, rubySegments } from './ruby'

export type {
  ConjugatedForm,
  ConjugationKind,
  ConjugationMode,
  ConjugationTable
} from './conjugation-table'
export { conjugationTable, formsFor, supportsModes } from './conjugation-table'

export const conjugationKinds: Record<ConjugationKind, { title: string; explanation: string }> = {
  'present-future': {
    title: 'Present/Future',
    explanation:
      'The non-past form. It can describe a present habit or fact, or a future action or state.'
  },
  past: { title: 'Past', explanation: 'Describes an action or state in the past.' },
  negative: {
    title: 'Negative',
    explanation: 'Says that an action does not happen, or a state is not true.'
  },
  'past-negative': {
    title: 'Past Negative',
    explanation: 'Says that an action did not happen, or a state was not true.'
  },
  'te-form': {
    title: 'Te-Form',
    explanation:
      'A connecting form. It can link actions or descriptions and, depending on context, show sequence, cause, or reason.'
  },
  potential: {
    title: 'Potential',
    explanation:
      'Expresses ability or possibility: that someone can do the action or that the action is possible.'
  },
  passive: {
    title: 'Passive',
    explanation:
      'Presents the person, thing, or event affected by an action as the focus. The exact meaning depends on context.'
  },
  causative: {
    title: 'Causative',
    explanation:
      'Expresses causing or allowing another person or thing to perform an action or enter a state.'
  },
  conditional: {
    title: 'Conditional',
    explanation: 'Sets a condition for what follows: if this happens, the next statement can apply.'
  },
  volitional: {
    title: 'Volitional',
    explanation:
      'Expresses will or intention. In context, it can also propose doing something together.'
  },
  imperative: {
    title: 'Imperative',
    explanation: 'Gives a strong command or instruction. It can sound forceful, so context matters.'
  },
  standalone: {
    title: 'Standalone',
    explanation:
      "The adjective's base form, shown on its own rather than attached to a noun or verb."
  },
  'modifying-a-noun': {
    title: 'Modifying a Noun',
    explanation: 'Places the adjective before a noun to describe that noun.'
  },
  adverb: {
    title: 'Adverb',
    explanation: 'Places the adjective form before a verb to describe how an action is done.'
  },
  noun: {
    title: 'Noun',
    explanation: 'Turns the adjective into a noun that names the quality or its degree.'
  }
}

export function sharedSpellings(
  table: ConjugationTable,
  form: ConjugatedForm,
  mode: ConjugationMode
): string[] {
  return formsFor(table, mode)
    .filter(other => other.kind !== form.kind && other.surface === form.surface)
    .map(other => conjugationKinds[other.kind].title)
}

export function rowShowsFurigana(form: ConjugatedForm): boolean {
  return Array.from(form.ending).some(scalar => {
    const code = scalar.codePointAt(0) ?? 0
    return (code >= 0x4e00 && code <= 0x9fff) || scalar === '々'
  })
}

export interface ConjugationRow extends ConjugatedForm {
  title: string
  explanation: string
  ruby: RubySegment[]
  rowFurigana: boolean
  sharedSpellings: string[]
}

export interface Conjugations {
  rule: string
  modes: ConjugationMode[]
  rows: Record<ConjugationMode, ConjugationRow[]>
}

export function conjugations(
  entry: Pick<EntryRow, 'headword' | 'reading' | 'partsOfSpeech'>,
  readings: KanjiReadings
): Conjugations | null {
  const table = conjugationTable(entry)
  if (!table) return null
  const modes: ConjugationMode[] = supportsModes(table) ? ['Plain', 'Polite'] : ['Plain']
  const rows = (mode: ConjugationMode): ConjugationRow[] =>
    formsFor(table, mode).map(form => ({
      ...form,
      ...conjugationKinds[form.kind],
      ruby: withKanjiReadings(rubySegments(form.surface, form.reading), readings),
      rowFurigana: rowShowsFurigana(form),
      sharedSpellings: sharedSpellings(table, form, mode)
    }))
  return { rule: table.rule, modes, rows: { Plain: rows('Plain'), Polite: rows('Polite') } }
}

export function sharedSpellingNote(titles: readonly string[]): string {
  const list =
    titles.length <= 2
      ? titles.join(' and ')
      : `${titles.slice(0, -1).join(', ')}, and ${titles.at(-1)}`
  return `Same spelling as ${list}. Context tells them apart.`
}
