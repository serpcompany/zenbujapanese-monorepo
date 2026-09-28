// How the app words and draws dictionary data, shared with apps/ios/docs/product/dictionary.md.

/** Ports PartOfSpeechFormatter.swift: one word class, then its modifiers, in sentence case. */
export function partOfSpeechPhrase(parts: readonly string[]): string {
  const transitive = parts.includes('transitive')
  const intransitive = parts.includes('intransitive')
  const hasVerbClass = parts.some(part => part in verbClassNames)
  let phrases: string[] = []
  for (const part of parts) {
    const verb = verbClassNames[part]
    if (verb) phrases.push(verb)
    // A generic "Verb" adds nothing beside a specific class such as "Godan verb".
    else if (part === 'verb') {
      if (!hasVerbClass) phrases.push('Verb')
    }
    // "Noun (の)" and "Adverb (と)" already say noun and adverb.
    else if (part === 'noun') {
      if (!parts.includes('noAdjective')) phrases.push('Noun')
    } else if (part === 'adverb') {
      if (!parts.includes('adverbTo')) phrases.push('Adverb')
    } else if (otherNames[part]) phrases.push(otherNames[part])
  }
  phrases = [...new Set(phrases)]
  if (transitive || intransitive) {
    const modifier =
      transitive && intransitive
        ? 'transitive or intransitive'
        : transitive
          ? 'transitive'
          : 'intransitive'
    const verbIndex = phrases.findIndex(phrase => phrase === 'Verb' || phrase.endsWith(' verb'))
    if (verbIndex >= 0) phrases[verbIndex] += ` (${modifier})`
    else phrases.push(`Verb (${modifier})`)
  }
  return phrases.join(' · ')
}

const verbClassNames: Record<string, string> = {
  godanVerb: 'Godan verb',
  ichidanVerb: 'Ichidan verb',
  suruVerb: 'する verb',
  takesSuru: 'する verb',
  kuruVerb: 'Irregular verb',
  zuruVerb: 'Zuru verb',
  archaicVerb: 'Archaic verb',
  auxiliaryVerb: 'Auxiliary verb'
}

const otherNames: Record<string, string> = {
  pronoun: 'Pronoun',
  nounPrefix: 'Prefix',
  nounSuffix: 'Suffix',
  noAdjective: 'Noun (の)',
  prenominal: 'Prenominal',
  preNounAdjective: 'Pre-noun adjective',
  iAdjective: 'I-adjective',
  naAdjective: 'Na-adjective',
  taruAdjective: 'Taru adjective',
  archaicAdjective: 'Archaic adjective',
  archaicNaAdjective: 'Archaic na-adjective',
  adverbTo: 'Adverb (と)',
  auxiliary: 'Auxiliary',
  auxiliaryAdjective: 'Auxiliary adjective',
  conjunction: 'Conjunction',
  copula: 'Copula',
  counter: 'Counter',
  expression: 'Expression',
  interjection: 'Interjection',
  numeric: 'Number',
  prefix: 'Prefix',
  suffix: 'Suffix',
  particle: 'Particle'
}

export interface RubySegment {
  text: string
  /** Furigana, only on segments that aren't already kana. */
  reading?: string
}

const isKana = (character: string) => /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(character)
const toHiragana = (value: string) =>
  value.replace(/[ァ-ヶ]/g, character =>
    String.fromCharCode((character.codePointAt(0) ?? 0) - 0x60)
  )

/**
 * Splits a headword into kana and kanji runs and places each kanji run's share of the reading
 * over it (要る over いる gives い on 要). Falls back to the whole reading over the whole word.
 */
export function furigana(headword: string, reading: string): RubySegment[] {
  const runs: { text: string; kana: boolean }[] = []
  for (const character of headword) {
    const kana = isKana(character)
    const last = runs.at(-1)
    if (last && last.kana === kana) last.text += character
    else runs.push({ text: character, kana })
  }
  if (runs.every(run => run.kana)) return [{ text: headword }]
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `^${runs.map(run => (run.kana ? escapeRegExp(toHiragana(run.text)) : '(.+?)')).join('')}$`,
    'u'
  )
  const match = toHiragana(reading).match(pattern)
  if (!match) return [{ text: headword, reading }]
  let group = 1
  return runs.map(run =>
    run.kana ? { text: run.text } : { text: run.text, reading: match[group++] }
  )
}

const smallKana = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/u

/** The reading in katakana, split into morae, each marked high or low for the pitch drawing. */
export function pitchMorae(reading: string, downstep: number): { mora: string; high: boolean }[] {
  const katakana = reading.replace(/[ぁ-ゖ]/g, character =>
    String.fromCharCode((character.codePointAt(0) ?? 0) + 0x60)
  )
  const morae: string[] = []
  for (const character of katakana) {
    if (smallKana.test(character) && morae.length > 0) morae[morae.length - 1] += character
    else morae.push(character)
  }
  return morae.map((mora, index) => ({
    mora,
    high: downstep === 0 ? index > 0 : downstep === 1 ? index === 0 : index > 0 && index < downstep
  }))
}
