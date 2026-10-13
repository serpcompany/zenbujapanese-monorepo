import {
  adjectivesByIrregularComparative,
  nounsByIrregularPlural,
  verbsByIrregularForm
} from './english-irregular-forms'

const wordThatInflects = /^[a-z]{3,}$/
const vowel = /[aeiouy]/
const doubledFinalConsonant = /([b-df-hj-np-tv-z])\1$/
const endingThatTakesEs = /(?:[sxzo]|[cs]h)$/
const twoLettersEndingInAVowel = /^[a-z][aeiou]$/
const twoConsonants = /^[b-df-hj-np-tv-xz]{2}$/
const baseThatDoublesItsLastConsonant = /^[^aeiou]*[aeiou][b-df-hj-np-tvz]$/
const fewestLettersInABase = 3
const comparativeEndings = ['est', 'er']

export type EntriesOfABase = 'verbs' | 'nouns' | 'adjectives' | 'all' | 'allIfAVerb'

export interface BaseForm {
  base: string
  entries: EntriesOfABase
}

const isLongEnough = (base: string) => base.length >= fewestLettersInABase

const isLongEnoughOrLikeGo = (base: string) =>
  isLongEnough(base) || twoLettersEndingInAVowel.test(base)

const isLongEnoughOrAnAbbreviation = (base: string) =>
  isLongEnough(base) || twoConsonants.test(base)

const isLongEnoughAndTakesAnEndingAsWritten = (base: string) =>
  isLongEnough(base) && !baseThatDoublesItsLastConsonant.test(base)

const isLikeGoOrTakesAnEndingAsWritten = (base: string) =>
  twoLettersEndingInAVowel.test(base) || isLongEnoughAndTakesAnEndingAsWritten(base)

function basesBeforeAnEnding(stem: string, isABase: (stem: string) => boolean): string[] {
  if (stem.length < 2 || !vowel.test(stem)) return []
  const withoutItsDoubling = stem.slice(0, -1)
  return [
    ...(isABase(stem) ? [stem] : []),
    `${stem}e`,
    ...(doubledFinalConsonant.test(stem) && isLongEnough(withoutItsDoubling)
      ? [withoutItsDoubling]
      : [])
  ]
}

function basesOfAPluralOrThirdPerson(word: string): string[] {
  if (!word.endsWith('s') || word.endsWith('ss')) return []
  const withoutS = word.slice(0, -1)
  const withoutEs = word.slice(0, -2)
  const bases = word.endsWith('ies') ? [`${word.slice(0, -3)}y`, withoutS] : [withoutS]
  const takesEs =
    word.endsWith('es') && endingThatTakesEs.test(withoutEs) && isLongEnoughOrLikeGo(withoutEs)
  return [...bases.filter(isLongEnoughOrAnAbbreviation), ...(takesEs ? [withoutEs] : [])]
}

function basesOfAPast(word: string, isABase = isLongEnough): string[] {
  if (!word.endsWith('ed')) return []
  const withoutEd = word.slice(0, -2)
  return word.endsWith('ied')
    ? [`${word.slice(0, -3)}y`, word.slice(0, -1), withoutEd].filter(isLongEnough)
    : basesBeforeAnEnding(withoutEd, isABase)
}

function basesOfAnIngForm(word: string, isABase = isLongEnoughOrLikeGo): string[] {
  return word.endsWith('ing') ? basesBeforeAnEnding(word.slice(0, -3), isABase) : []
}

function baseIn(basesByForm: ReadonlyMap<string, string>, form: string): string[] {
  const base = basesByForm.get(form)
  return base === undefined ? [] : [base]
}

function basesOfAComparative(word: string): string[] {
  const irregular = baseIn(adjectivesByIrregularComparative, word)
  if (irregular.length > 0) return irregular
  const ending = comparativeEndings.find(candidate => word.endsWith(candidate))
  if (!ending) return []
  const stem = word.slice(0, -ending.length)
  return stem.endsWith('i')
    ? [`${stem.slice(0, -1)}y`].filter(isLongEnough)
    : basesBeforeAnEnding(stem, isLongEnoughAndTakesAnEndingAsWritten)
}

function possibleBaseForms(word: string): string[] {
  if (!wordThatInflects.test(word)) return [word]
  return [
    word,
    ...basesOfAPluralOrThirdPerson(word),
    ...basesOfAPast(word),
    ...basesOfAnIngForm(word)
  ]
}

const bringing =
  (entries: EntriesOfABase) =>
  (base: string): BaseForm => ({ base, entries })

export function baseFormsOf(word: string): BaseForm[] {
  if (!wordThatInflects.test(word)) return []
  return [
    ...basesOfAPluralOrThirdPerson(word).map(bringing('all')),
    ...basesOfAPast(word, isLongEnoughAndTakesAnEndingAsWritten).map(bringing('allIfAVerb')),
    ...basesOfAnIngForm(word, isLikeGoOrTakesAnEndingAsWritten).map(bringing('allIfAVerb')),
    ...basesOfAComparative(word).map(bringing('adjectives'))
  ]
}

export function irregularBaseFormsOf(word: string): BaseForm[] {
  return [
    ...baseIn(verbsByIrregularForm, word).map(bringing('verbs')),
    ...baseIn(nounsByIrregularPlural, word).map(bringing('nouns'))
  ]
}

export function sameWordInAnyForm(word: string): (other: string) => boolean {
  const lowered = word.toLowerCase()
  const bases = possibleBaseForms(lowered)
  return other => {
    const candidate = other.toLowerCase()
    return candidate === lowered || possibleBaseForms(candidate).some(base => bases.includes(base))
  }
}
