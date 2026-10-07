import { browseCategories, browseCategory } from '@zenbu/dictionary-core/browse/categories'
import { rankedLists } from '@zenbu/dictionary-core/browse/lists'
import { describe, expect, test } from 'vitest'
import { sources } from '../sources'
import { categoryDescriptions } from './category-intros'
import {
  categoryHeading,
  categoryIntro,
  featuredCategories,
  kanjiListIntro,
  moreWaysToBrowse,
  rankedListCopy,
  tierCutoffs
} from './copy'

describe('ranked lists', () => {
  test('each ranked list credits its source', () => {
    for (const list of rankedLists) {
      const credited = rankedListCopy[list.slug]?.sources ?? []
      const expected =
        list.slug === 'youtube'
          ? sources.tubelex
          : list.slug === 'wikipedia'
            ? sources.wikipedia
            : sources.jiten
      expect(credited, list.slug).toContain(expected)
    }
  })

  test('Jiten is credited under CC BY-SA 4.0 with its share-alike notice, the others BSD-3-Clause', () => {
    expect(sources.jiten.license.name).toBe('CC BY-SA 4.0')
    expect(sources.jiten.notice).toMatch(/shared under the same licence, CC BY-SA 4\.0/)
    expect(sources.wikipedia.license.name).toBe('BSD-3-Clause')
    expect(sources.tubelex.license.name).toBe('BSD-3-Clause')
  })
})

test('every category the pages feature is one the core lists', () => {
  const featured = [...Object.values(featuredCategories).flat(), ...moreWaysToBrowse]
  expect(featured.filter(slug => !browseCategory(slug))).toEqual([])
})

describe('category copy', () => {
  const category = (slug: string) => {
    const found = browseCategory(slug)
    if (!found) throw new Error(`No category ${slug}`)
    return found
  }

  test('names each kind of category as the mockups do', () => {
    expect(categoryHeading(category('onomatopoeia'))).toBe(
      'Japanese onomatopoeia and mimetic words'
    )
    expect(categoryHeading(category('godan-verbs'))).toBe('Japanese godan verbs')
    expect(categoryHeading(category('internet'))).toBe('Japanese internet vocabulary')
    expect(categoryHeading(category('kansai-dialect'))).toBe('Kansai dialect words')
  })

  test('says how many words JMdict marks, in what order, then what the category is', () => {
    expect(categoryIntro(category('onomatopoeia'), 1_338, 'used')).toBe(
      `1,338 words JMdict marks as onomatopoeic or mimetic, most used on YouTube first, starting with those it marks in their first meaning. ${categoryDescriptions.onomatopoeia}`
    )
    expect(categoryIntro(category('medicine'), 1, 'kana')).toMatch(
      /^1 word JMdict marks as medicine terms, in kana order\. Medical terms, such as /
    )
    expect(categoryIntro(category('common-words'), 30_035, 'used')).toMatch(
      /^30,035 words JMdict marks as common, from its priority lists, most used on YouTube first\. /
    )
  })

  test('every category has its own one- or two-sentence intro', () => {
    const slugs = browseCategories.map(each => each.slug)
    expect(Object.keys(categoryDescriptions).sort()).toEqual([...slugs].sort())
    for (const description of Object.values(categoryDescriptions)) {
      expect(description.match(/[.!?](?=\s|$)/gu)?.length ?? 0, description).toBeLessThanOrEqual(2)
    }
    expect(new Set(Object.values(categoryDescriptions)).size).toBe(slugs.length)
  })
})

describe('ranked list notes', () => {
  test('the Wikipedia and Jiten lists say which words aren’t ranked, and why', () => {
    for (const list of rankedLists) {
      const unranked = rankedListCopy[list.slug]?.unranked
      if (list.slug === 'youtube') expect(unranked).toBeUndefined()
      else expect(unranked, list.slug).toMatch(/such as に, は, and が, aren’t ranked/)
    }
  })

  test('the tier legend gives the cut-offs the app’s chips use', () => {
    expect(tierCutoffs).toBe(
      'The tiers are the ones the app’s chips use: very common to rank 1,500, common to rank 5,000, less common to rank 15,000, and uncommon to rank 30,000.'
    )
  })
})

test('kanji lists say what they hold', () => {
  expect(kanjiListIntro({ slug: 'grade-2', name: 'Grade 2', grades: [2] }, 160)).toMatch(
    /^The 160 kanji Japanese schools teach in the second year of primary school, most frequent first\./
  )
  expect(
    kanjiListIntro({ slug: 'strokes-1', name: '1 stroke', grades: [1], strokes: 1 }, 2)
  ).toMatch(/^The 2 jōyō kanji written with 1 stroke,/)
  expect(kanjiListIntro({ slug: 'jlpt-n5', name: 'JLPT N5', jlptLevel: 5 }, 79)).toMatch(
    /^The 79 kanji Jonathan Waller lists for JLPT N5, most frequent first\. The JLPT has published no kanji list since 2010/
  )
})
