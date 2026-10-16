import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import jaReview from '../../../content/reviews/ja.json'
import en from './dictionaries/en.json'
import ja from './dictionaries/ja.json'

const sameInEveryLanguage = new Set([
  'footer.copyright',
  'products.featuredApp.tags.platform',
  'products.facts.pdf'
])

type Leaf = [path: string, value: unknown]

function leaves(value: unknown, path = ''): Leaf[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key)
    )
  }
  return [[path, value]]
}

function parityProblems(english: unknown, other: unknown, allowed: ReadonlySet<string>) {
  const source = new Map(leaves(english))
  const translated = new Map(leaves(other))
  return [
    ...[...source.keys()].filter(key => !translated.has(key)).map(key => `${key} is missing`),
    ...[...translated.keys()].filter(key => !source.has(key)).map(key => `${key} is extra`),
    ...[...translated]
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => `${key} is empty`),
    ...[...translated]
      .filter(([key, value]) => value === source.get(key) && !allowed.has(key))
      .map(([key]) => `${key} is the English text`)
  ]
}

const checksum = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12)

describe('the Japanese dictionary pairs with the English one (SERP localization standard)', () => {
  test('it has exactly the keys of en.json, no empty value, and no English value but names', () => {
    expect(parityProblems(en, ja, sameInEveryLanguage)).toEqual([])
  })

  test('a copy of en.json fails the parity check', () => {
    expect(parityProblems(en, en, new Set()).length).toBe(leaves(en).length)
  })

  test('every name kept in English is a key the dictionaries have', () => {
    const keys = new Set(leaves(en).map(([key]) => key))
    expect([...sameInEveryLanguage].filter(key => !keys.has(key))).toEqual([])
  })

  test('no Japanese string is stale: each was written against the English it pairs with', () => {
    const written = jaReview.sourceChecksums as Record<string, string>
    const english = new Map(leaves(en))
    const stale = [...english]
      .filter(([key, value]) => written[key] !== checksum(String(value)))
      .map(([key]) => key)
    expect(
      stale,
      'These keys’ English changed (or is new) since their Japanese was written. Update their Japanese in ja.json, then record it with `pnpm i18n:stamp ja <key>…` (docs/agents/web.md, Languages)'
    ).toEqual([])
    expect(Object.keys(written).filter(key => !english.has(key))).toEqual([])
  })

  test('the review record names no reviewer until a native speaker has reviewed the Japanese', () => {
    expect(Object.keys(jaReview).sort()).toEqual(['reviewedAt', 'reviewedBy', 'sourceChecksums'])
    expect(jaReview.reviewedBy === null).toBe(jaReview.reviewedAt === null)
  })
})
