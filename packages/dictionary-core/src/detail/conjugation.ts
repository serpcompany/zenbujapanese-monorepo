// Ports the conjugation table: `JapaneseConjugator` in JapaneseConjugationClient.swift, and what
// ConjugationsView.swift shows for it (each kind's title and explanation, the forms that share a
// spelling, and which rows show furigana). See also those files; .github/workflows/
// search-parity.yml makes the two sides change together, and the word-detail suite's
// `opensConjugations` and `conjugations` check this port against the app.

import { type KanjiReadings, withKanjiReadings } from './kanji-split'
import type { EntryRow } from './rows'
import { type RubySegment, rubySegments } from './ruby'
import { graphemes } from './text'

export type ConjugationMode = 'Plain' | 'Polite'

/** `ConjugatedForm.Kind`, by raw value. */
export type ConjugationKind =
  | 'present-future'
  | 'past'
  | 'negative'
  | 'past-negative'
  | 'te-form'
  | 'potential'
  | 'passive'
  | 'causative'
  | 'conditional'
  | 'volitional'
  | 'imperative'
  | 'standalone'
  | 'modifying-a-noun'
  | 'adverb'
  | 'noun'

export interface ConjugatedForm {
  kind: ConjugationKind
  surface: string
  reading: string
  /** The part of `surface` added after the unchanging stem, such as させる in 見させる. */
  ending: string
}

export interface ConjugationTable {
  /** One line on how this word class forms its conjugations. */
  rule: string
  plain: ConjugatedForm[]
  /** Empty for a class without a Polite register (adjectives). */
  polite: ConjugatedForm[]
}

/** `ConjugationKindPresentation`: each kind's row title and what the form's screen says it means. */
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

/** `VerbSuffixes`, in `verbRules` order. */
type VerbSuffixes = [
  presentFuture: string,
  past: string,
  negative: string,
  pastNegative: string,
  teForm: string,
  potential: string,
  passive: string,
  causative: string,
  conditional: string,
  volitional: string,
  imperative: string
]

const verbKinds: ConjugationKind[] = [
  'present-future',
  'past',
  'negative',
  'past-negative',
  'te-form',
  'potential',
  'passive',
  'causative',
  'conditional',
  'volitional',
  'imperative'
]

interface Rule {
  kind: ConjugationKind
  surface: string
  reading: string
}

function verbRules(surface: VerbSuffixes, reading: VerbSuffixes = surface): Rule[] {
  return verbKinds.map((kind, index) => ({
    kind,
    surface: surface[index],
    reading: reading[index]
  }))
}

function forms(surfaceStem: string, readingStem: string, rules: Rule[]): ConjugatedForm[] {
  return rules.map(rule => ({
    kind: rule.kind,
    surface: surfaceStem + rule.surface,
    reading: readingStem + rule.reading,
    ending: rule.surface
  }))
}

/** Drops the last `count` Characters, as Swift's `dropLast`. */
function dropLast(value: string, count = 1): string {
  return graphemes(value).slice(0, -count).join('')
}

function lastCharacter(value: string): string | undefined {
  return graphemes(value).at(-1)
}

function iAdjectiveTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable | null {
  if (
    entry.headword === 'いい' ||
    lastCharacter(entry.headword) !== 'い' ||
    lastCharacter(entry.reading) !== 'い'
  ) {
    return null
  }
  const suffixes: [ConjugationKind, string][] = [
    ['present-future', 'い'],
    ['past', 'かった'],
    ['negative', 'くない'],
    ['past-negative', 'くなかった'],
    ['te-form', 'くて'],
    ['adverb', 'く'],
    ['noun', 'さ']
  ]
  return {
    rule: 'Drop the final い, then add the ending.',
    plain: forms(
      dropLast(entry.headword),
      dropLast(entry.reading),
      suffixes.map(([kind, suffix]) => ({ kind, surface: suffix, reading: suffix }))
    ),
    polite: []
  }
}

function naAdjectiveTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable {
  const suffixes: [ConjugationKind, string][] = [
    ['standalone', ''],
    ['modifying-a-noun', 'な'],
    ['te-form', 'で'],
    ['adverb', 'に'],
    ['noun', 'さ']
  ]
  return {
    rule: 'Keep the word as is and add な, で, or に.',
    plain: forms(
      entry.headword,
      entry.reading,
      suffixes.map(([kind, suffix]) => ({ kind, surface: suffix, reading: suffix }))
    ),
    polite: []
  }
}

function suruTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable | null {
  if (!entry.headword.endsWith('する') || !entry.reading.endsWith('する')) return null
  const surfaceStem = dropLast(entry.headword, 2)
  const readingStem = dropLast(entry.reading, 2)
  return {
    rule: 'Conjugate する like an irregular verb after the noun.',
    plain: forms(
      surfaceStem,
      readingStem,
      verbRules([
        'する',
        'した',
        'しない',
        'しなかった',
        'して',
        'できる',
        'される',
        'させる',
        'すれば',
        'しよう',
        'しろ'
      ])
    ),
    polite: forms(
      surfaceStem,
      readingStem,
      verbRules([
        'します',
        'しました',
        'しません',
        'しませんでした',
        'して',
        'できます',
        'されます',
        'させます',
        'すれば',
        'しましょう',
        'しなさい'
      ])
    )
  }
}

function kuruTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable {
  const surfaceUsesKanji = entry.headword.endsWith('来る')
  const surfaceStem = dropLast(entry.headword, 2)
  const readingStem = dropLast(entry.reading, 2)
  const plainReading: VerbSuffixes = [
    'くる',
    'きた',
    'こない',
    'こなかった',
    'きて',
    'こられる',
    'こられる',
    'こさせる',
    'くれば',
    'こよう',
    'こい'
  ]
  const politeReading: VerbSuffixes = [
    'きます',
    'きました',
    'きません',
    'きませんでした',
    'きて',
    'こられます',
    'こられます',
    'こさせます',
    'くれば',
    'きましょう',
    'きなさい'
  ]
  const plainSurface: VerbSuffixes = surfaceUsesKanji
    ? [
        '来る',
        '来た',
        '来ない',
        '来なかった',
        '来て',
        '来られる',
        '来られる',
        '来させる',
        '来れば',
        '来よう',
        '来い'
      ]
    : plainReading
  const politeSurface: VerbSuffixes = surfaceUsesKanji
    ? [
        '来ます',
        '来ました',
        '来ません',
        '来ませんでした',
        '来て',
        '来られます',
        '来られます',
        '来させます',
        '来れば',
        '来ましょう',
        '来なさい'
      ]
    : politeReading
  return {
    rule: '来る is irregular: its reading changes between く, き, and こ.',
    plain: forms(surfaceStem, readingStem, verbRules(plainSurface, plainReading)),
    polite: forms(surfaceStem, readingStem, verbRules(politeSurface, politeReading))
  }
}

function ichidanTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable | null {
  if (lastCharacter(entry.headword) !== 'る' || lastCharacter(entry.reading) !== 'る') return null
  const surfaceStem = dropLast(entry.headword)
  const readingStem = dropLast(entry.reading)
  return {
    rule: 'Drop る, then add the ending.',
    plain: forms(
      surfaceStem,
      readingStem,
      verbRules([
        'る',
        'た',
        'ない',
        'なかった',
        'て',
        'られる',
        'られる',
        'させる',
        'れば',
        'よう',
        'ろ'
      ])
    ),
    polite: forms(
      surfaceStem,
      readingStem,
      verbRules([
        'ます',
        'ました',
        'ません',
        'ませんでした',
        'て',
        'られます',
        'られます',
        'させます',
        'れば',
        'ましょう',
        'なさい'
      ])
    )
  }
}

/** `GodanEnding`: a final kana's a, i, e, and o rows, and its past and te-form endings. */
const godanEndings: Record<
  string,
  [a: string, i: string, e: string, o: string, past: string, te: string]
> = {
  う: ['わ', 'い', 'え', 'お', 'った', 'って'],
  く: ['か', 'き', 'け', 'こ', 'いた', 'いて'],
  ぐ: ['が', 'ぎ', 'げ', 'ご', 'いだ', 'いで'],
  す: ['さ', 'し', 'せ', 'そ', 'した', 'して'],
  つ: ['た', 'ち', 'て', 'と', 'った', 'って'],
  ぬ: ['な', 'に', 'ね', 'の', 'んだ', 'んで'],
  ぶ: ['ば', 'び', 'べ', 'ぼ', 'んだ', 'んで'],
  む: ['ま', 'み', 'め', 'も', 'んだ', 'んで'],
  る: ['ら', 'り', 'れ', 'ろ', 'った', 'って']
}

function godanTable(entry: Pick<EntryRow, 'headword' | 'reading'>): ConjugationTable | null {
  const final = lastCharacter(entry.headword)
  const readingFinal = lastCharacter(entry.reading)
  if (
    final === undefined ||
    !Object.hasOwn(godanEndings, final) ||
    readingFinal === undefined ||
    !Object.hasOwn(godanEndings, readingFinal) ||
    final !== readingFinal
  ) {
    return null
  }
  const [a, i, e, o, godanPast, godanTe] = godanEndings[final]
  const surfaceStem = dropLast(entry.headword)
  const readingStem = dropLast(entry.reading)
  const isIkuException = entry.headword.endsWith('行く')
  const past = isIkuException ? 'った' : godanPast
  const teForm = isIkuException ? 'って' : godanTe
  return {
    rule: 'Change the final kana to another vowel sound, then add the ending.',
    plain: forms(
      surfaceStem,
      readingStem,
      verbRules([
        final,
        past,
        `${a}ない`,
        `${a}なかった`,
        teForm,
        `${e}る`,
        `${a}れる`,
        `${a}せる`,
        `${e}ば`,
        `${o}う`,
        e
      ])
    ),
    polite: forms(
      surfaceStem,
      readingStem,
      verbRules([
        `${i}ます`,
        `${i}ました`,
        `${i}ません`,
        `${i}ませんでした`,
        teForm,
        `${e}ます`,
        `${a}れます`,
        `${a}せます`,
        `${e}ば`,
        `${i}ましょう`,
        `${i}なさい`
      ])
    )
  }
}

/**
 * `JapaneseConjugator.table(for:)`: the table for the entry's first conjugating class among its
 * parts of speech (the entry's, not the first sense's), or null when it has none.
 */
export function conjugationTable(
  entry: Pick<EntryRow, 'headword' | 'reading' | 'partsOfSpeech'>
): ConjugationTable | null {
  const has = (part: string) => entry.partsOfSpeech.includes(part)
  if (has('suruVerb')) return suruTable(entry)
  if (has('kuruVerb') && entry.reading.endsWith('くる')) return kuruTable(entry)
  if (has('ichidanVerb')) return ichidanTable(entry)
  if (has('godanVerb')) return godanTable(entry)
  if (has('iAdjective')) return iAdjectiveTable(entry)
  if (has('naAdjective')) return naAdjectiveTable(entry)
  return null
}

/** `ConjugationTable.supportsModes`: whether the Plain/Polite control shows. */
export function supportsModes(table: ConjugationTable): boolean {
  return table.polite.length > 0
}

/** `ConjugationTable.forms(for:)`: Polite falls back to Plain for a class without it. */
export function formsFor(table: ConjugationTable, mode: ConjugationMode): ConjugatedForm[] {
  return mode === 'Polite' && table.polite.length > 0 ? table.polite : table.plain
}

/** `ConjugationTable.sharedSpellings(of:in:)`: other forms' titles with the same spelling. */
export function sharedSpellings(
  table: ConjugationTable,
  form: ConjugatedForm,
  mode: ConjugationMode
): string[] {
  return formsFor(table, mode)
    .filter(other => other.kind !== form.kind && other.surface === form.surface)
    .map(other => conjugationKinds[other.kind].title)
}

/**
 * `ConjugatedForm.rowShowsFurigana`: only when the ending has kanji (U+4E00–U+9FFF, or 々), as in
 * 来させる; the header already gives the stem's reading.
 */
export function rowShowsFurigana(form: ConjugatedForm): boolean {
  return Array.from(form.ending).some(scalar => {
    const code = scalar.codePointAt(0) ?? 0
    return (code >= 0x4e00 && code <= 0x9fff) || scalar === '々'
  })
}

/** A row of the table, with what its form's screen shows. */
export interface ConjugationRow extends ConjugatedForm {
  title: string
  explanation: string
  /** The form's furigana, with each kanji run's per-kanji split, as its headline shows it. */
  ruby: RubySegment[]
  /** Whether the row itself shows furigana. */
  rowFurigana: boolean
  /** Other forms' titles in the register with the same spelling. */
  sharedSpellings: string[]
}

/** What the part-of-speech row opens: ConjugationsView, and each row's ConjugatedFormView. */
export interface Conjugations {
  rule: string
  /** Plain alone, or Plain and Polite when the control shows. */
  modes: ConjugationMode[]
  rows: Record<ConjugationMode, ConjugationRow[]>
}

/** The entry's conjugation screens, or null when its part of speech opens none. */
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

// Each form's screen has its own URL (the website's urls.ts), as the app pushes it as its own
// screen. The conjugations sitemap lists which of them search engines may index
// (../artifact/conjugation-sitemap.ts), from these.

/** The registers, by the URL segment that names them. */
export const conjugationModes: Record<string, ConjugationMode> = {
  plain: 'Plain',
  polite: 'Polite'
}

/** Whether a kind is one the app's conjugator names (`ConjugatedForm.Kind`). */
export function isConjugationKind(kind: string): kind is ConjugationKind {
  return Object.hasOwn(conjugationKinds, kind)
}

/**
 * The screen that is a form's canonical URL, among screens showing the same spelling and so the
 * same examples. A Polite form spelled as the Plain form of its kind (the te-form and the
 * conditional) names that Plain screen. Then, within the register, a form spelled as an earlier
 * form in the app's order (passive 見られる, after potential 見られる) names that earlier form.
 * Every other form is its own.
 */
export function canonicalForm(
  table: Pick<ConjugationTable, 'plain' | 'polite'>,
  mode: ConjugationMode,
  form: ConjugatedForm
): { mode: ConjugationMode; kind: ConjugationKind } {
  const plainSame = table.plain.find(other => other.kind === form.kind)
  const register: ConjugationMode =
    mode === 'Polite' && plainSame?.surface === form.surface ? 'Plain' : mode
  const forms = register === 'Polite' && table.polite.length > 0 ? table.polite : table.plain
  const first = forms.find(other => other.surface === form.surface)
  return { mode: register, kind: first?.kind ?? form.kind }
}

/**
 * The form screens search engines may index, as `<register>/<kind>`: each canonical screen that
 * lists examples. A screen without examples is only its explanation and the form.
 */
export function indexedForms(
  table: ConjugationTable,
  hasExamples: (surface: string) => boolean
): string[] {
  const modes: ConjugationMode[] = supportsModes(table) ? ['Plain', 'Polite'] : ['Plain']
  return modes.flatMap(mode =>
    formsFor(table, mode)
      .filter(form => {
        if (!hasExamples(form.surface)) return false
        const canonical = canonicalForm(table, mode, form)
        return canonical.mode === mode && canonical.kind === form.kind
      })
      .map(form => `${mode.toLowerCase()}/${form.kind}`)
  )
}

/** The "Same spelling as …" note: Swift's `.list(type: .and)` in English. */
export function sharedSpellingNote(titles: readonly string[]): string {
  const list =
    titles.length <= 2
      ? titles.join(' and ')
      : `${titles.slice(0, -1).join(', ')}, and ${titles.at(-1)}`
  return `Same spelling as ${list}. Context tells them apart.`
}
