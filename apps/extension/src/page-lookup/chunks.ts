import { maximumSegmentedLength } from '@zenbu/dictionary-core/cards/segmentable'

export type Chunk = { start: number; text: string }

const japanese = /[\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}]/u

const sentence = /[^。！？!?\n]*(?:[。！？!?\n]+|$)/gu

export const hasJapanese = (text: string) => japanese.test(text)

function pieces(text: string, limit: number): string[] {
  return (text.match(sentence) ?? [])
    .filter(found => found !== '')
    .flatMap(found => {
      const points = Array.from(found)
      if (points.length <= limit) return [found]
      const parts: string[] = []
      for (let at = 0; at < points.length; at += limit) {
        parts.push(points.slice(at, at + limit).join(''))
      }
      return parts
    })
}

export function chunks(text: string, limit = maximumSegmentedLength): Chunk[] {
  const found: Chunk[] = []
  let start = 0
  let current = ''
  let size = 0
  const close = () => {
    if (current !== '') found.push({ start, text: current })
    start += current.length
    current = ''
    size = 0
  }
  for (const piece of pieces(text, limit)) {
    const length = Array.from(piece).length
    if (size + length > limit) close()
    current += piece
    size += length
  }
  close()
  return found.filter(chunk => hasJapanese(chunk.text))
}
