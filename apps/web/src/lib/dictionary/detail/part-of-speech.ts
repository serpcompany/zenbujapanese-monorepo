// Ports PartOfSpeechFormatter.swift: one word class, then its modifiers, in sentence case, such as
// "Godan verb (intransitive)" rather than "Godan Verb · Intransitive Verb".

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

/** Everything else. "Unclassified" is left out: it tells a learner nothing. */
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

const name = (names: Record<string, string>, part: string) =>
  Object.hasOwn(names, part) ? names[part] : undefined

/** `PartOfSpeechFormatter.phrase(for:)`. */
export function partOfSpeechPhrase(parts: readonly string[]): string {
  const transitive = parts.includes('transitive')
  const intransitive = parts.includes('intransitive')
  const hasVerbClass = parts.some(part => name(verbClassNames, part) !== undefined)
  let phrases: string[] = []
  for (const part of parts) {
    const verb = name(verbClassNames, part)
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
    } else {
      const other = name(otherNames, part)
      if (other) phrases.push(other)
    }
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
