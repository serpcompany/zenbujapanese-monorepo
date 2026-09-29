// Ports JapaneseRubyAnnotation (apps/ios/Modules/Sources/SearchExperience/
// JapaneseTextAnalysisClient.swift), which JapaneseRubyText.swift draws: furigana sliced from the
// original reading, over kanji and 々 only.

import { graphemes, isCJKUnifiedIdeograph } from './text'

export interface RubySegment {
  text: string
  /** Furigana, only over kanji runs. */
  reading?: string
}

/** `Character.isKanjiOrIterationMark`: 々, or a scalar in U+3400–U+9FFF. */
function isKanjiOrIterationMark(character: string): boolean {
  return character === '々' || isCJKUnifiedIdeograph(character)
}

interface SurfaceRun {
  base: string
  isKanji: boolean
}

/** `JapaneseRubyAnnotation.segments(surface:reading:)`. */
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

/**
 * Walks the reading run by run: each kana run must appear in it at the cursor, and each kanji
 * run takes the reading up to the next kana run's first match after at least one character.
 * The match is the first one, so 黄色い声 (きいろいこえ) gives 黄色 き and 声 ろいこえ, as in
 * the app.
 */
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

// ICU's Katakana-Hiragana, which `applyingTransform(.hiraganaToKatakana, reverse: true)` runs.
// ヷ–ヺ have no precomposed hiragana, so they become a kana and a combining dakuten: still one
// Character each, so the reading's positions don't move.
const voicedKatakana: Record<string, string> = {
  ヷ: 'わ゙',
  ヸ: 'ゐ゙',
  ヹ: 'ゑ゙',
  ヺ: 'を゙'
}

/** `normalizedKana`: the value's Characters with katakana read as hiragana. */
function normalizedKana(value: string): string[] {
  const converted = value.replace(/[ァ-ヶヽヾヷ-ヺ]/gu, character => {
    const voiced = voicedKatakana[character]
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
