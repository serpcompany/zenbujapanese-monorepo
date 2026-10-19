import { describe, expect, test } from 'vitest'
import { getDictionary } from './i18n/dictionary'
import {
  characters,
  descriptionLength,
  fitsTitle,
  fittedDescription,
  joinedSentences,
  longestTitle,
  shortened,
  siteTitle
} from './snippets'

const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ')

describe('titles fit search results with the site name after them', () => {
  test('a title is followed by the site name', () => {
    expect(siteTitle('要る (いる) meaning')).toBe('要る (いる) meaning | Zenbu Japanese')
  })

  test('a title fits when it and the site name are at most 70 characters', () => {
    const room = longestTitle - characters(' | Zenbu Japanese')
    expect(fitsTitle('x'.repeat(room))).toBe(true)
    expect(fitsTitle('x'.repeat(room + 1))).toBe(false)
    expect(fitsTitle('漢'.repeat(room))).toBe(true)
  })

  test('characters are counted as code points, as Ahrefs counts them', () => {
    expect(characters('𠮟る')).toBe(2)
    expect(characters('ego')).toBe(3)
  })
})

describe('shortened', () => {
  test('leaves a text that fits as it is', () => {
    expect(shortened('A short text.')).toBe('A short text.')
    expect(shortened('x'.repeat(160))).toBe('x'.repeat(160))
  })

  test('cuts a long text at its last space, comma, or 、 before the limit, and marks the cut', () => {
    expect(shortened('to go, to move, to head', 16)).toBe('to go, to move…')
    expect(shortened('いく、ゆく、かよう', 7)).toBe('いく、ゆく…')
    const cut = shortened(words(40))
    expect(cut).toMatch(/word…$/)
    expect(characters(cut)).toBeLessThanOrEqual(descriptionLength.longest)
  })

  test('cuts mid-word when the text has nowhere better to break', () => {
    expect(shortened('x'.repeat(200))).toBe(`${'x'.repeat(159)}…`)
  })
})

describe('joinedSentences', () => {
  test('joins sentences as each language writes them, skipping missing ones', () => {
    expect(joinedSentences(['One.', null, 'Two.', undefined, 'Three.'], 'en')).toBe(
      'One. Two. Three.'
    )
    expect(joinedSentences(['一つ。', '二つ。'], 'ja')).toBe('一つ。二つ。')
    expect(joinedSentences([null], 'en')).toBe('')
  })
})

describe('fittedDescription', () => {
  const closing = getDictionary('en').site.closing

  test('adds sentences until the description reaches 110 characters, then stops', () => {
    const lead = 'x'.repeat(100)
    expect(fittedDescription(lead, ['First.', 'Second.'], 'en')).toBe(`${lead} First. Second.`)
    const long = 'x'.repeat(110)
    expect(fittedDescription(long, ['First.'], 'en')).toBe(long)
  })

  test('skips a sentence that would pass 160 characters, and tries the next', () => {
    const lead = 'x'.repeat(100)
    expect(fittedDescription(lead, ['y'.repeat(60)], 'en')).toBe(`${lead} ${closing}`)
  })

  test('takes the first of a sentence’s alternatives that fits, longest first', () => {
    const lead = 'x'.repeat(100)
    const alternatives = ['y'.repeat(70), 'z'.repeat(40), 'w'.repeat(20)]
    expect(fittedDescription(lead, [alternatives], 'en')).toBe(`${lead} ${'z'.repeat(40)}`)
  })

  test('ends with the site’s closing sentence, in each language', () => {
    expect(fittedDescription('A list of words.', [], 'en')).toBe(
      'A list of words. Free on the web and in the iPhone app.'
    )
    expect(fittedDescription('言葉の一覧です。', [], 'ja')).toBe(
      '言葉の一覧です。Zenbu Japaneseの和英辞典は、ウェブでもiPhoneアプリでも無料で使えます。'
    )
  })

  test('shortens a lead that passes 160 characters', () => {
    const description = fittedDescription(words(40), [], 'en')
    expect(description).toMatch(/…$/)
    expect(characters(description)).toBeLessThanOrEqual(descriptionLength.longest)
  })
})
