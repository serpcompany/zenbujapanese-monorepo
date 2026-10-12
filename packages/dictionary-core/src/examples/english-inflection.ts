const wordThatInflects = /^[a-z]{3,}$/
const vowel = /[aeiouy]/
const doubledFinalConsonant = /([b-df-hj-np-tv-z])\1$/
const endingThatTakesEs = /(?:[sxzo]|[cs]h)$/
const twoLettersEndingInAVowel = /^[a-z][aeiou]$/
const fewestLettersInABase = 3

const isLongEnough = (base: string) => base.length >= fewestLettersInABase

const isLongEnoughOrLikeGo = (base: string) =>
  isLongEnough(base) || twoLettersEndingInAVowel.test(base)

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
  return [...bases.filter(isLongEnough), ...(takesEs ? [withoutEs] : [])]
}

function basesOfAPast(word: string): string[] {
  if (!word.endsWith('ed')) return []
  const withoutEd = word.slice(0, -2)
  return word.endsWith('ied')
    ? [`${word.slice(0, -3)}y`, word.slice(0, -1), withoutEd].filter(isLongEnough)
    : basesBeforeAnEnding(withoutEd, isLongEnough)
}

function possibleBaseForms(word: string): string[] {
  if (!wordThatInflects.test(word)) return [word]
  return [
    word,
    ...basesOfAPluralOrThirdPerson(word),
    ...basesOfAPast(word),
    ...(word.endsWith('ing') ? basesBeforeAnEnding(word.slice(0, -3), isLongEnoughOrLikeGo) : [])
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
