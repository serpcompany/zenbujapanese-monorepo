import { browseCategories, browseCategory } from '@zenbu/dictionary-core/browse/categories'
import { allRankBands, rankedLists } from '@zenbu/dictionary-core/browse/lists'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { describe, expect, test } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { categoryName } from './category-names'
import {
  categoryDescription,
  categoryHeading,
  categoryIntro,
  featuredCategories,
  kanjiListHeading,
  kanjiListIntro,
  moreWaysToBrowse,
  rankedListCopy,
  rankRange,
  shortBandLabel,
  tierCutoffs
} from './copy'
import { rankPageRanks } from './rank-pages'

const category = (slug: string) => {
  const found = browseCategory(slug)
  if (!found) throw new Error(`No category ${slug}`)
  return found
}

describe('ranked lists', () => {
  test('each ranked list credits its source', () => {
    for (const list of rankedLists) {
      const credited = rankedListCopy(list.slug, 'en')?.sources ?? []
      const expected =
        list.slug === 'youtube'
          ? sourceCredits.tubelex
          : list.slug === 'wikipedia'
            ? sourceCredits.wikipedia
            : sourceCredits.jiten
      expect(credited, list.slug).toContain(expected)
    }
  })

  test('Jiten is credited under CC BY-SA 4.0 with its share-alike notice, the others BSD-3-Clause', () => {
    expect(sourceCredits.jiten.license.name).toBe('CC BY-SA 4.0')
    expect(sourceCredits.jiten.notice).toMatch(/shared under the same licence, CC BY-SA 4\.0/)
    expect(sourceCredits.wikipedia.license.name).toBe('BSD-3-Clause')
    expect(sourceCredits.tubelex.license.name).toBe('BSD-3-Clause')
  })
})

test('every category the pages feature is one the core lists', () => {
  const featured = [...Object.values(featuredCategories).flat(), ...moreWaysToBrowse]
  expect(featured.filter(slug => !browseCategory(slug))).toEqual([])
})

describe('category copy', () => {
  test('names each kind of category as the mockups do', () => {
    expect(categoryHeading(category('onomatopoeia'), 'en')).toBe(
      'Japanese onomatopoeia and mimetic words'
    )
    expect(categoryHeading(category('godan-verbs'), 'en')).toBe('Japanese godan verbs')
    expect(categoryHeading(category('internet'), 'en')).toBe('Japanese internet vocabulary')
    expect(categoryHeading(category('kansai-dialect'), 'en')).toBe('Kansai dialect words')
  })

  test('the English headings the dictionary spells out are the ones the kind would give', () => {
    expect(categoryHeading(category('trademarks'), 'en')).toBe('Japanese trademarks vocabulary')
    expect(categoryHeading(category('no-adjectives'), 'en')).toBe('Japanese no-adjectives')
    expect(categoryHeading(category('obsolete-words'), 'en')).toBe('Japanese obsolete words')
  })

  test('says how many words JMdict marks, in what order, then what the category is', () => {
    expect(categoryIntro(category('onomatopoeia'), 1_338, 'used', 'en')).toBe(
      `1,338 words JMdict marks as onomatopoeic or mimetic, most used on YouTube first, starting with those it marks in their first meaning. ${categoryDescription('onomatopoeia', 'en')}`
    )
    expect(categoryIntro(category('medicine'), 1, 'kana', 'en')).toMatch(
      /^1 word JMdict marks as medicine terms, in kana order\. Medical terms, such as /
    )
    expect(categoryIntro(category('common-words'), 30_035, 'used', 'en')).toMatch(
      /^30,035 words JMdict marks as common, from its priority lists, most used on YouTube first\. /
    )
  })

  test('every category has its own one- or two-sentence intro in each language', () => {
    const slugs = browseCategories.map(each => each.slug).sort()
    for (const [locale, sentenceEnd] of [
      ['en', /[.!?](?=\s|$)/gu],
      ['ja', /。/gu]
    ] as const) {
      const intros = getDictionary(locale).categoryIntros
      expect(Object.keys(intros).sort(), locale).toEqual(slugs)
      for (const description of Object.values(intros)) {
        expect(description.match(sentenceEnd)?.length ?? 0, description).toBeLessThanOrEqual(2)
      }
      expect(new Set(Object.values(intros)).size, locale).toBe(slugs.length)
    }
  })

  test('every category has a Japanese name, the word page’s chip where it has one', () => {
    const untranslated = browseCategories.filter(
      each => /[A-Za-z]{2}/u.test(categoryName(each, 'ja')) || categoryName(each, 'ja') === ''
    )
    expect(untranslated.map(each => each.slug)).toEqual([])
    expect(categoryName(category('godan-verbs'), 'ja')).toBe('五段動詞')
    expect(categoryName(category('honorific-language'), 'ja')).toBe('尊敬語')
    expect(categoryName(category('godan-verbs'), 'en')).toBe('Godan verbs')
  })

  test('a Japanese category page names its list and says what JMdict marks, in Japanese', () => {
    expect(categoryHeading(category('godan-verbs'), 'ja')).toBe('五段動詞一覧')
    expect(categoryHeading(category('medicine'), 'ja')).toBe('医学用語一覧')
    expect(categoryHeading(category('kansai-dialect'), 'ja')).toBe('関西弁一覧')
    expect(categoryHeading(category('onomatopoeia'), 'ja')).toBe('擬音語・擬態語（オノマトペ）一覧')
    expect(categoryIntro(category('medicine'), 1_234, 'kana', 'ja')).toBe(
      `JMdictで医学の用語とされている言葉1,234語を、五十音順に並べています。${categoryDescription('medicine', 'ja')}`
    )
  })
})

describe('ranked list notes', () => {
  test('the Wikipedia and Jiten lists say which words aren’t ranked, and why', () => {
    for (const list of rankedLists) {
      const unranked = rankedListCopy(list.slug, 'en')?.unranked
      const japanese = rankedListCopy(list.slug, 'ja')?.unranked
      if (list.slug === 'youtube') {
        expect(unranked).toBeUndefined()
        expect(japanese).toBeUndefined()
      } else {
        expect(unranked, list.slug).toMatch(/such as に, は, and が, aren’t ranked/)
        expect(japanese, list.slug).toMatch(/「に」「は」「が」のように/)
      }
    }
  })

  test('the tier legend gives the cut-offs the app’s chips use', () => {
    expect(tierCutoffs('en')).toBe(
      'The tiers are the ones the app’s chips use: very common to rank 1,500, common to rank 5,000, less common to rank 15,000, and uncommon to rank 30,000.'
    )
    expect(tierCutoffs('ja')).toBe(
      '目安はアプリのチップと同じで、「とてもよく使われる」は1,500位まで、「よく使われる」は5,000位まで、「ときどき使われる」は15,000位まで、「あまり使われない」は30,000位までです。'
    )
  })

  test('a band and each of its pages are their ranks, written for each language', () => {
    const [first, second] = allRankBands
    const last = allRankBands[allRankBands.length - 1]
    expect(rankRange(second, 'en')).toBe('1,001–2,000')
    expect(rankRange(second, 'ja')).toBe('1,001〜2,000位')
    expect(rankRange(rankPageRanks(2, 2), 'en')).toBe('1,201–1,400')
    expect(rankRange(rankPageRanks(2, 2), 'ja')).toBe('1,201〜1,400位')
    expect([first, second, last].map(band => shortBandLabel(band, 'en'))).toEqual([
      '1–1k',
      '1k–2k',
      '9k–10k'
    ])
    expect([first, second, last].map(band => shortBandLabel(band, 'ja'))).toEqual([
      '〜1000',
      '〜2000',
      '〜1万'
    ])
  })
})

describe('kanji lists', () => {
  test('say what they hold', () => {
    expect(kanjiListIntro({ slug: 'grade-2', name: 'Grade 2', grades: [2] }, 160, 'en')).toMatch(
      /^The 160 kanji Japanese schools teach in the second year of primary school, most frequent first\./
    )
    expect(
      kanjiListIntro({ slug: 'strokes-1', name: '1 stroke', grades: [1], strokes: 1 }, 2, 'en')
    ).toMatch(/^The 2 jōyō kanji written with 1 stroke,/)
    expect(kanjiListIntro({ slug: 'jlpt-n5', name: 'JLPT N5', jlptLevel: 5 }, 79, 'en')).toMatch(
      /^The 79 kanji Jonathan Waller lists for JLPT N5, most frequent first\. The JLPT has published no kanji list since 2010/
    )
  })

  test('are named the way Japanese searches name them', () => {
    expect(kanjiListHeading({ slug: 'grade-4', name: 'Grade 4', grades: [4] }, 'en')).toBe(
      'Grade 4 kanji'
    )
    expect(kanjiListHeading({ slug: 'grade-4', name: 'Grade 4', grades: [4] }, 'ja')).toBe(
      '小学4年生で習う漢字一覧'
    )
    expect(kanjiListHeading({ slug: 'jinmeiyo', name: 'Jinmeiyō', grades: [9, 10] }, 'ja')).toBe(
      '人名用漢字一覧'
    )
    expect(
      kanjiListIntro({ slug: 'strokes-3', name: '3 strokes', grades: [1], strokes: 3 }, 12, 'ja')
    ).toMatch(/^3画の常用漢字12字を、よく使われる順に並べています。漢字を押すと/)
  })
})
