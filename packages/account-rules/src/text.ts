const unsafe = /[\p{Cc}\p{Cs}]/u
const everyUnsafe = /[\p{Cc}\p{Cs}]/gu
const surrogate = /\p{Cs}/u
const invisible = /\p{Cc}|\p{Cf}|\p{Cs}/u
const replacement = '\u{FFFD}'

const madeSafe = (character: string) => (surrogate.test(character) ? replacement : ' ')

const codePoints = (text: string) => [...text].length

export const hasInvisibleCharacters = (text: string) => invisible.test(text)

export const isBlank = (text: string) => text.trim() === ''

export const plainText = (raw: string) =>
  (unsafe.test(raw) ? raw.replace(everyUnsafe, madeSafe) : raw).normalize('NFC').trim()

export function cutText(raw: string, most: number) {
  const plain = plainText(raw)
  return plain.length <= most ? plain : [...plain].slice(0, most).join('').trim()
}

export function keptWithin(text: string, least: number, most: number) {
  if (text.length < least) return false
  if (text.length <= most && text.length >= 2 * least) return true
  const length = codePoints(text)
  return length >= least && length <= most
}
