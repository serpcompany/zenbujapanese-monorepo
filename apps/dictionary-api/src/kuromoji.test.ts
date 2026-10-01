import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { groupInflections, kuromojiCandidates } from '@zenbu/dictionary-core/examples/morphology'
import { describe, expect, test } from 'vitest'
import { loadKuromoji } from './kuromoji'

const directory = fileURLToPath(
  new URL('../../ios/Modules/Sources/SearchExperience/Resources/Kuromoji', import.meta.url)
)
const dictionaryPulledFromGitLfs = (() => {
  try {
    return !readFileSync(`${directory}/base.dat.gz`).subarray(0, 7).toString().startsWith('version')
  } catch {
    return false
  }
})()

describe.runIf(dictionaryPulledFromGitLfs)("the app's Kuromoji in Node", () => {
  const tokenize = dictionaryPulledFromGitLfs ? loadKuromoji(directory) : () => []

  test('splits a sentence as the app records it', () => {
    const text = '見るからに明らかだよ。'
    const candidates = kuromojiCandidates(text, tokenize(text))
    expect(candidates?.map(candidate => candidate.surface)).toEqual([
      '見る',
      'から',
      'に',
      '明らか',
      'だ',
      'よ',
      '。'
    ])
    expect(candidates?.[0]).toMatchObject({ reading: 'ミル', partOfSpeech: ['動詞', '自立'] })
  })

  test('joins inflections the app joins', () => {
    const text = '私は昨日やむをえず外出せざるをえなかった。'
    const candidates = kuromojiCandidates(text, tokenize(text)) ?? []
    expect(groupInflections(candidates).map(candidate => candidate.surface)).toContain('えなかった')
  })
})

test('refuses Kuromoji files other than the pinned ones', () => {
  expect(() => loadKuromoji(fileURLToPath(new URL('.', import.meta.url)))).toThrow()
})
