import { graphemes, isCJKUnifiedIdeograph } from './text'

export interface RubySegment {
  text: string
  reading?: string
  kanjiReadings?: string[]
}

function isKanjiOrIterationMark(character: string): boolean {
  return character === '々' || isCJKUnifiedIdeograph(character)
}

interface SurfaceRun {
  base: string
  isKanji: boolean
}

export function rubySegments(surface: string, reading: string): RubySegment[] {
  const characters = graphemes(surface)
  if (!characters.some(isKanjiOrIterationMark) || surface === reading) return [{ text: surface }]
  const runs: SurfaceRun[] = []
  for (const character of characters) {
    const isKanji = isKanjiOrIterationMark(character)
    const last = runs.at(-1)
    if (last && last.isKanji === isKanji) last.base += character
    else runs.push({ base: character, isKanji })
  }
  if (!runs.some(run => run.isKanji) || !runs.some(run => !run.isKanji)) {
    return [{ text: surface, reading }]
  }
  return alignedSegments(runs, reading) ?? runs.map(run => ({ text: run.base }))
}

function alignedSegments(runs: SurfaceRun[], reading: string): RubySegment[] | null {
  const originalReading = graphemes(reading)
  const normalizedReading = normalizedKana(reading)
  let cursor = 0
  const segments: RubySegment[] = []
  for (const [index, run] of runs.entries()) {
    if (run.isKanji) {
      const nextKana = runs.slice(index + 1).find(next => !next.isKanji)
      if (nextKana) {
        const anchorStart = firstIndex(normalizedKana(nextKana.base), normalizedReading, cursor + 1)
        if (anchorStart === null) return null
        const ruby = originalReading.slice(cursor, anchorStart).join('')
        if (!ruby) return null
        segments.push({ text: run.base, reading: ruby })
        cursor = anchorStart
      } else {
        if (cursor >= originalReading.length) return null
        segments.push({ text: run.base, reading: originalReading.slice(cursor).join('') })
        cursor = originalReading.length
      }
    } else {
      const anchor = normalizedKana(run.base)
      if (
        cursor + anchor.length > normalizedReading.length ||
        !sameCharacters(normalizedReading.slice(cursor, cursor + anchor.length), anchor)
      ) {
        return null
      }
      segments.push({ text: run.base })
      cursor += anchor.length
    }
  }
  return cursor === originalReading.length ? segments : null
}

const katakanaWithoutPrecomposedHiragana: Record<string, string> = {
  ヷ: 'わ゙',
  ヸ: 'ゐ゙',
  ヹ: 'ゑ゙',
  ヺ: 'を゙'
}

function normalizedKana(value: string): string[] {
  const converted = value.replace(/[ァ-ヶヽヾヷ-ヺ]/gu, character => {
    const voiced = katakanaWithoutPrecomposedHiragana[character]
    return voiced ?? String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60)
  })
  return graphemes(converted)
}

function sameCharacters(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((character, index) => character === right[index])
  )
}

function firstIndex(needle: string[], haystack: string[], start: number): number | null {
  if (needle.length === 0 || start < 0 || start + needle.length > haystack.length) return null
  for (let index = start; index <= haystack.length - needle.length; index++) {
    if (sameCharacters(haystack.slice(index, index + needle.length), needle)) return index
  }
  return null
}

export interface FuriganaSegment {
  base: string
  reading?: string
  kanjiReadings?: string[]
}

export function furiganaSegments(ruby: readonly RubySegment[]): FuriganaSegment[] {
  return ruby.map(({ text, reading, kanjiReadings }) => ({
    base: text,
    ...(reading === undefined ? {} : { reading }),
    ...(kanjiReadings === undefined ? {} : { kanjiReadings })
  }))
}
