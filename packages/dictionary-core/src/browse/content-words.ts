const functionWordParts: ReadonlySet<string> = new Set([
  'particle',
  'auxiliary',
  'auxiliaryVerb',
  'auxiliaryAdjective',
  'conjunction',
  'copula'
])

const affixParts: ReadonlySet<string> = new Set(['prefix', 'nounPrefix', 'suffix', 'nounSuffix'])

export function isContentWord(
  firstSenseParts: readonly string[],
  partsOfSpeech: readonly string[]
): boolean {
  if (firstSenseParts.some(part => functionWordParts.has(part))) return false
  return !(partsOfSpeech.length > 0 && partsOfSpeech.every(part => affixParts.has(part)))
}
