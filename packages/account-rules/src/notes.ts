import { keptWithin } from './text'

export const noteTextLength = 10_000

const lineBreaks = /\r\n?/g
const surrogates = /\p{Cs}/gu
const controlsButLinesAndTabs = /[^\P{Cc}\n\t]/gu

export const keptNoteText = (typed: string) =>
  typed
    .replace(lineBreaks, '\n')
    .replace(surrogates, '\u{FFFD}')
    .replace(controlsButLinesAndTabs, ' ')
    .normalize('NFC')
    .trim()

export function noteText(typed: string): string | null {
  const text = keptNoteText(typed)
  return keptWithin(text, 1, noteTextLength) ? text : null
}
