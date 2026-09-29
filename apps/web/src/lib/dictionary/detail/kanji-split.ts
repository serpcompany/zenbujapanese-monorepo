// Ports the per-kanji furigana highlight: KanjiReadingSplitter.swift, and `kanjiReadings` in
// JapaneseRubyText.swift, which picks the furigana segments it applies to. See also those files;
// .github/workflows/search-parity.yml makes the two sides change together, and the word-detail
// suite's `furigana[].kanjiReadings` checks this port against the app.

import type { KanjiReadingRow } from './rows'
import type { RubySegment } from './ruby'
import { graphemes } from './text'

/** The readings of the kanji a word is written with, by character, as KANJIDIC2 lists them. */
export type KanjiReadings = ReadonlyMap<string, readonly KanjiReadingRow[]>

/**
 * `hiragana` in KanjiReadingSplitter.swift: each Character that is one scalar in U+30A1–U+30F6
 * moves down 0x60; everything else stays.
 */
function hiragana(value: string): string[] {
  return graphemes(value).map(character => {
    const scalars = Array.from(character)
    const code = character.codePointAt(0) ?? 0
    return scalars.length === 1 && code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character
  })
}

/** `soundChanges`: the voiced and half-voiced kana a compound can turn a reading's first into. */
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

/**
 * `variants`, for one kanji: its on and kun readings (not name readings) in hiragana, without
 * `-` and the okurigana after `.`, each also with its sound changes, and with a final つ, ち, く,
 * or き turned into a small っ (学 がく → がっ). Each form is a list of Characters.
 */
function variants(readings: readonly KanjiReadingRow[]): string[][] {
  const forms = new Map<string, string[]>()
  for (const reading of readings) {
    if (reading.kind === 'name') continue
    // Swift's `split(separator:)` drops empty pieces, so a leading `.` doesn't empty the base.
    const pieces = hiragana(reading.value)
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
  // Longest first, as the app tries them; which split is found doesn't depend on the order.
  return [...forms.values()].sort((left, right) => right.length - left.length)
}

function startsWith(target: string[], position: number, candidate: string[]): boolean {
  return candidate.every((character, index) => target[position + index] === character)
}

/**
 * `KanjiReadingSplitter.split(_:reading:)`: one reading per character of `kanji`, or null when
 * no split, or more than one, fits. 々 reads as the kanji before it. Each part keeps the
 * reading's own kana, such as katakana.
 */
export function splitKanjiReading(
  kanji: string,
  reading: string,
  readings: KanjiReadings
): string[] | null {
  const characters = graphemes(kanji)
  const target = hiragana(reading)
  const cache = new Map<string, string[][]>()
  // A kanji KANJIDIC2 doesn't list has no readings, so nothing splits.
  const variantsOf = (character: string) => {
    let forms = cache.get(character)
    if (!forms) {
      forms = variants(readings.get(character) ?? [])
      cache.set(character, forms)
    }
    return forms
  }
  // Each split as the number of the reading's Characters each kanji takes.
  const found: number[][] = []
  const current: number[] = []

  function search(index: number, position: number, previous: string | null): void {
    if (found.length >= 2) return
    if (index >= characters.length) {
      if (position === target.length) found.push([...current])
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
  if (found.length !== 1) return null
  const original = graphemes(reading)
  let offset = 0
  return found[0].map(length => {
    const part = original.slice(offset, offset + length).join('')
    offset += length
    return part
  })
}

/**
 * `JapaneseRubyText.kanjiReadings`: each kanji's part of a furigana segment's reading, for a
 * segment of two or more characters whose kanji readings split it exactly one way.
 */
export function kanjiReadings(segment: RubySegment, readings: KanjiReadings): string[] | null {
  if (segment.reading === undefined || graphemes(segment.text).length <= 1) return null
  return splitKanjiReading(segment.text, segment.reading, readings)
}

/** The headword's furigana with each segment's per-kanji split, where it has one. */
export function withKanjiReadings(
  segments: readonly RubySegment[],
  readings: KanjiReadings
): RubySegment[] {
  return segments.map(segment => {
    const split = kanjiReadings(segment, readings)
    return split ? { ...segment, kanjiReadings: split } : segment
  })
}
