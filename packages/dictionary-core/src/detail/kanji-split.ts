import type { KanjiReadingRow } from './rows'
import type { RubySegment } from './ruby'
import { graphemes } from './text'

export type KanjiReadings = Pick<ReadonlyMap<string, readonly KanjiReadingRow[]>, 'get'>

function hiraganaCharacters(value: string): string[] {
  return graphemes(value).map(character => {
    if (character.length !== 1) return character
    const code = character.charCodeAt(0)
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character
  })
}

const soundChanges: Record<string, string[]> = {
  か: ['が'],
  き: ['ぎ'],
  く: ['ぐ'],
  け: ['げ'],
  こ: ['ご'],
  さ: ['ざ'],
  し: ['じ'],
  す: ['ず'],
  せ: ['ぜ'],
  そ: ['ぞ'],
  た: ['だ'],
  ち: ['ぢ', 'じ'],
  つ: ['づ', 'ず'],
  て: ['で'],
  と: ['ど'],
  は: ['ば', 'ぱ'],
  ひ: ['び', 'ぴ'],
  ふ: ['ぶ', 'ぷ'],
  へ: ['べ', 'ぺ'],
  ほ: ['ぼ', 'ぽ']
}

const knownVariants = new WeakMap<readonly KanjiReadingRow[], string[][]>()
const unread: readonly KanjiReadingRow[] = []

function variants(readings: readonly KanjiReadingRow[]): string[][] {
  let known = knownVariants.get(readings)
  if (!known) {
    known = readingVariants(readings)
    knownVariants.set(readings, known)
  }
  return known
}

function readingVariants(readings: readonly KanjiReadingRow[]): string[][] {
  const forms = new Map<string, string[]>()
  for (const reading of readings) {
    if (reading.kind === 'name') continue
    const pieces = hiraganaCharacters(reading.value)
      .filter(character => character !== '-')
      .join('')
      .split('.')
      .filter(piece => piece !== '')
    const base = graphemes(pieces[0] ?? '')
    if (base.length === 0) continue
    const stems = [
      base,
      ...(soundChanges[base[0]] ?? []).map(changed => [changed, ...base.slice(1)])
    ]
    for (const stem of stems) {
      forms.set(stem.join(''), stem)
      const last = stem.at(-1)
      if (stem.length > 1 && last !== undefined && 'つちくき'.includes(last)) {
        const small = [...stem.slice(0, -1), 'っ']
        forms.set(small.join(''), small)
      }
    }
  }
  return [...forms.values()].sort((left, right) => right.length - left.length)
}

function startsWith(target: string[], position: number, candidate: string[]): boolean {
  for (let index = 0; index < candidate.length; index++) {
    if (target[position + index] !== candidate[index]) return false
  }
  return true
}

export function splitKanjiReading(
  kanji: string,
  reading: string,
  readings: KanjiReadings
): string[] | null {
  const characters = graphemes(kanji)
  const target = hiraganaCharacters(reading)
  const splitLengths: number[][] = []
  const current: number[] = []

  function search(index: number, position: number, previous: string | null): void {
    if (splitLengths.length >= 2) return
    if (index >= characters.length) {
      if (position === target.length) splitLengths.push([...current])
      return
    }
    const character = characters[index]
    const source = character === '々' ? previous : character
    if (source === null) return
    for (const candidate of variants(readings.get(source) ?? unread)) {
      if (!startsWith(target, position, candidate)) continue
      current.push(candidate.length)
      search(index + 1, position + candidate.length, source)
      current.pop()
    }
  }

  search(0, 0, null)
  if (splitLengths.length !== 1) return null
  const original = graphemes(reading)
  let offset = 0
  return splitLengths[0].map(length => {
    const part = original.slice(offset, offset + length).join('')
    offset += length
    return part
  })
}

export function kanjiReadings(segment: RubySegment, readings: KanjiReadings): string[] | null {
  if (segment.reading === undefined || graphemes(segment.text).length <= 1) return null
  return splitKanjiReading(segment.text, segment.reading, readings)
}

export function withKanjiReadings(
  segments: readonly RubySegment[],
  readings: KanjiReadings
): RubySegment[] {
  return segments.map(segment => {
    const split = kanjiReadings(segment, readings)
    return split ? { ...segment, kanjiReadings: split } : segment
  })
}
