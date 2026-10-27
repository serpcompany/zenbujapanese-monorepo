export interface TimedLine {
  start: number
  end: number
  text: string
}

export interface Caption {
  id: number
  start: number
  end: number
  text: string
  translation: string | null
}

const lineBreaks = /[\n\v\f\r\u0085\u2028\u2029]/u
const edgeSpaces = /^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu
const soundTags = /\p{White_Space}*[[［][^\]］]*[\]］]\p{White_Space}*/gu

function spoken(text: string, joiner: string): string {
  return text
    .split(lineBreaks)
    .map(part => part.replace(edgeSpaces, ''))
    .filter(part => part !== '')
    .join(joiner)
    .replace(soundTags, ' ')
    .replace(edgeSpaces, '')
}

export function continuesSentence(text: string): boolean {
  return text.startsWith("n't") || text.startsWith("'")
}

export function japaneseCaptions(lines: readonly TimedLine[]): Caption[] {
  const captions: Caption[] = []
  lines.forEach((line, index) => {
    const text = spoken(line.text, '')
    if (text === '') return
    const end = Math.min(line.end, lines[index + 1]?.start ?? Number.POSITIVE_INFINITY)
    captions.push({
      id: captions.length,
      start: line.start,
      end: Math.max(end, line.start),
      text,
      translation: null
    })
  })
  return captions
}

export function translationSentences(lines: readonly TimedLine[]): Caption[] {
  const sentences: Caption[] = []
  let sentenceStart: number | undefined
  for (const line of lines) {
    const text = spoken(line.text, ' ')
    if (text === '') {
      sentenceStart ??= line.start
      continue
    }
    const start = sentenceStart ?? line.start
    sentenceStart = undefined
    const previous = continuesSentence(text) ? sentences.pop() : undefined
    sentences.push({
      id: previous?.id ?? sentences.length,
      start,
      end: line.end,
      text: (previous?.text ?? '') + text,
      translation: null
    })
  }
  return sentences
}
