const surrogates = /\p{Cs}/gu
const controls = /\p{Cc}/gu
const invisible = /\p{Cc}|\p{Cf}|\p{Cs}/u
const replacement = '\u{FFFD}'

const codePoints = (text: string) => [...text].length

export const hasInvisibleCharacters = (text: string) => invisible.test(text)

export const isBlank = (text: string) => text.trim() === ''

export const plainText = (raw: string) =>
  raw.replace(surrogates, replacement).replace(controls, ' ').normalize('NFC').trim()

export const cutText = (raw: string, most: number) =>
  [...plainText(raw)].slice(0, most).join('').trim()

export const keptWithin = (text: string, least: number, most: number) => {
  const length = codePoints(text)
  return length >= least && length <= most
}
