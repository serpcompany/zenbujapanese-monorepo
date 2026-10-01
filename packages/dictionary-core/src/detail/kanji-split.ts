import type { KanjiReadingRow } from './rows'
import type { RubySegment } from './ruby'
import { graphemes } from './text'

export type KanjiReadings = ReadonlyMap<string, readonly KanjiReadingRow[]>

function hiraganaCharacters(value: string): string[] {
  return graphemes(value).map(character => {
    const scalars = Array.from(character)
    const code = character.codePointAt(0) ?? 0
    return scalars.length === 1 && code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character
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

function variants(readings: readonly KanjiReadingRow[]): string[][] {
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
  return candidate.every((character, index) => target[position + index] === character)
}

export function splitKanjiReading(
  kanji: string,
  reading: string,
  readings: KanjiReadings
): string[] | null {
  const characters = graphemes(kanji)
  const target = hiraganaCharacters(reading)
  const cache = new Map<string, string[][]>()
  const variantsOf = (character: string) => {
    let forms = cache.get(character)
    if (!forms) {
      forms = variants(readings.get(character) ?? [])
      cache.set(character, forms)
    }
    return forms
  }
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
    for (const candidate of variantsOf(source)) {
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
