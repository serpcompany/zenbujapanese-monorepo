import type { Locator } from '@playwright/test'
import { meaningGapRem } from '../src/shared/meaning-aid.ts'
import { type Extension, expect, test } from './fixtures.ts'
import { changeSettings } from './words-page.ts'

const rootFontPixels = 16

const wordGapPixels = meaningGapRem * rootFontPixels

function underlinedRuns(line: Locator) {
  return line.evaluate(source => {
    const runs: string[] = []
    let narrowestGap = Number.POSITIVE_INFINITY
    let before: DOMRect | null = null
    for (const word of source.querySelectorAll<HTMLElement>('[data-word]')) {
      const box = word.getBoundingClientRect()
      const sameLine = before !== null && box.top < before.bottom && box.bottom > before.top
      const gap = before && sameLine ? Math.round((box.left - before.right) * 10) / 10 : null
      if (gap !== null) narrowestGap = Math.min(narrowestGap, gap)
      if (gap !== null && gap < 1) runs[runs.length - 1] += word.dataset.word
      else runs.push(word.dataset.word ?? '')
      before = box
    }
    return { runs, narrowestGap }
  })
}

async function expectEachWordApart(lines: Locator, words: readonly string[][]) {
  const splits = await Promise.all((await lines.all()).map(underlinedRuns))
  expect(splits.map(split => split.runs)).toEqual(words)
  for (const { narrowestGap } of splits) {
    expect(narrowestGap).toBeGreaterThanOrEqual(wordGapPixels - 0.5)
  }
}

export async function expectWordsApartWithMeaningsOffAndOn(
  extension: Extension,
  surface: Locator,
  words: readonly string[][]
) {
  const lines = surface.locator('[data-source]')
  await expect(surface.locator('[data-word]')).toHaveCount(words.flat().length)
  await expectEachWordApart(lines, words)
  await surface.screenshot({ path: test.info().outputPath('word-meanings-off.png') })
  await changeSettings(extension, { 'readingAids.wordMeanings': true })
  await expect(surface.locator('[data-aid="meaning"]')).toHaveCount(words.flat().length)
  await expectEachWordApart(lines, words)
  await surface.screenshot({ path: test.info().outputPath('word-meanings-on.png') })
}
