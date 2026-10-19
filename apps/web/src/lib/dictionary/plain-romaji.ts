import { romaji } from '@zenbu/dictionary-core/detail/romaji'

const combiningMark = /\p{Mn}/gu
const particleEnding = /[はへ]$/u
const plainLatin = /^[a-z][a-z' -]*$/u

const unmarked = (reading: string) =>
  romaji(reading)?.normalize('NFD').replace(combiningMark, '').normalize('NFC') ?? null

export function plainRomaji(reading: string): string | null {
  if (particleEnding.test(reading)) return null
  const written = unmarked(reading)
  return written && plainLatin.test(written) ? written : null
}

const loosely = (latin: string) =>
  latin
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ha$/, 'wa')
    .replace(/ou/g, 'o')
    .replace(/([aeiou])\1/g, '$1')

export function spellsReading(query: string, reading: string): boolean {
  const written = unmarked(reading)
  return written !== null && loosely(written) === loosely(query)
}
