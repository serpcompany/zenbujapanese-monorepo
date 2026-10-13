import { searchDatabase } from '@zenbu/dictionary-core/artifact/database'
import { entriesExamplesUse } from '@zenbu/dictionary-core/search/english-word-entries'
import { describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, dictionary } from './support'

const used: [word: string, headwords: string[]][] = [
  ['pen', ['ペン']],
  ['head', ['頭']],
  ['meat', ['肉']],
  ['open', ['開ける', '開く']],
  ['have', ['持つ', '有る']],
  ['station', ['駅']],
  ['home', ['家']],
  ['money', ['お金', '金']],
  ['time', ['時間', '時']],
  ['car', ['車']],
  ['key', ['鍵']],
  ['dinner', ['夕食', '晩御飯']],
  ['book', ['本']],
  ['cat', ['猫']],
  ['went', ['行く']],
  ['ate', ['食べる']],
  ['saw', ['見る']],
  ['bought', ['買う']],
  ['it', ['それ']]
]

describe.runIf(artifactAvailable)('the entries example sentences use, on the app’s data', () => {
  const named = async (words: string[]) =>
    entriesExamplesUse(searchDatabase(await artifactDatabase()), words)

  test.each(used)('「%s」 names one of %s', async (word, headwords) => {
    expect(headwords).toContain((await named([word])).get(word)?.headword)
  })

  test('the small words that mean nothing on their own name none, nor does a word no pair has', async () => {
    expect(await named(['a', 'an', 'the', 'of', 'xyzzy'])).toEqual(new Map())
  })

  test('an English sentence lists them, each with the meaning that is its word or the entry’s own', async () => {
    const service = await dictionary({ morphology: false })
    const { screen } = await service.search('She saw his pen.')
    expect(
      screen.state === 'results' && screen.rows.map(row => [row.headword, row.summary])
    ).toEqual([
      ['彼女', 'she'],
      ['見る', 'to see, to look, to watch, to view, to observe'],
      ['彼', 'he, him'],
      ['ペン', 'pen']
    ])
  })
})
