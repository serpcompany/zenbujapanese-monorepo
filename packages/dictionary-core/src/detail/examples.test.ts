import { describe, expect, test } from 'vitest'
import { exampleCountText, licenseUrl, wordExample } from './examples'
import type { ExampleSentenceRow, WordExampleRow } from './rows'

const sentence: ExampleSentenceRow = {
  id: 1,
  pairId: '4dbf806c17dfcd0ff6d355f71abb46ba',
  japanese: '君を見なかっただよ。',
  english: "I didn't see you.",
  tokens: [
    { text: '君', reading: 'くん' },
    { text: 'を' },
    { text: '見なかった', reading: 'みなかった', dictionaryForm: '見る' },
    { text: 'だ' },
    { text: 'よ' },
    { text: '。' }
  ],
  japaneseTatoebaId: 148840,
  japaneseContributor: null,
  japaneseLicense: 'CC BY 2.0 FR',
  englishTatoebaId: 265718,
  englishContributor: 'CM',
  englishLicense: 'CC0 1.0'
}

const example: WordExampleRow = {
  entSeq: 1259290,
  position: 3,
  sentenceId: 1,
  highlights: [2],
  links: [
    { token: 0, entSeqs: [1311120], reading: 'きみ' },
    { token: 1, entSeqs: [2029010] },
    { token: 2, entSeqs: [1259290] },
    { token: 3, entSeqs: [2089020, 1628500] },
    { token: 4, entSeqs: [2029080] }
  ],
  tokens: null
}

describe('wordExample', () => {
  const shown = wordExample({ sentence, example })

  test('links each word, with furigana over linked kanji only', () => {
    expect(
      shown.tokens.map(token => [token.text, token.ruby, token.link, token.isPageWord])
    ).toEqual([
      // The page's link names the reading the app shows, not Kuromoji's.
      ['君', [{ text: '君', reading: 'きみ' }], { entSeq: 1311120 }, false],
      ['を', [{ text: 'を' }], { entSeq: 2029010 }, false],
      [
        '見なかった',
        [{ text: '見', reading: 'み' }, { text: 'なかった' }],
        { entSeq: 1259290 },
        true
      ],
      // An ambiguous word has no furigana and searches for its dictionary form.
      ['だ', [{ text: 'だ' }], { entSeqs: [2089020, 1628500], query: 'だ' }, false],
      ['よ', [{ text: 'よ' }], { entSeq: 2029080 }, false],
      ['。', [{ text: '。' }], null, false]
    ])
  })

  test('keeps the position, text, translation, and both sides’ attribution', () => {
    expect(shown).toMatchObject({
      position: 3,
      text: '君を見なかっただよ。',
      translation: "I didn't see you.",
      japanese: { id: 148840, contributor: null, license: 'CC BY 2.0 FR' },
      english: { id: 265718, contributor: 'CM', license: 'CC0 1.0' }
    })
  })

  test("uses the page's own tokens where the app splits the sentence differently", () => {
    const tokens = [{ text: '君を見なかっただよ。' }]
    const whole = wordExample({ sentence, example: { ...example, tokens, links: [] } })
    expect(whole.tokens.map(token => token.text)).toEqual(['君を見なかっただよ。'])
  })
})

test('exampleCountText', () => {
  expect(exampleCountText(null)).toBeNull()
  expect(exampleCountText({ listed: 1, truncated: false })).toBe('1 example')
  expect(exampleCountText({ listed: 55, truncated: false })).toBe('55 examples')
  expect(exampleCountText({ listed: 100, truncated: true })).toBe(
    'The first 100 of more than 100 examples'
  )
})

test('licenseUrl', () => {
  expect(licenseUrl('CC BY 2.0 FR')).toBe('https://creativecommons.org/licenses/by/2.0/fr/')
  expect(licenseUrl('Unknown')).toBeNull()
})
