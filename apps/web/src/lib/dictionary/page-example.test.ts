import { wordExample } from '@zenbu/dictionary-core/detail/examples'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { expect, test } from 'vitest'
import { type Links, pageExample, sentencesScreen } from './page-example'

const links: Links = { word: () => null, kanji: () => null }

const [row] = fixtureWordRows.find(rows => rows.entry.entSeq === 1546640)?.examples ?? []

test('a word’s example keeps each linked word’s short meaning and the sentence’s romaji', () => {
  const example = pageExample(wordExample(row), links)
  expect(example.tokens.flatMap(token => token.meaning ?? [])).toEqual(
    row.example.links.flatMap(link => (link.entSeqs.length === 1 ? (link.meaning ?? []) : []))
  )
  expect(example.tokens.some(token => token.meaning !== null)).toBe(true)
  expect(example.romaji).toBe(row.example.romaji)
})

test('the Example Sentences section shows no word meanings, as the app’s Example Sentences screen', () => {
  const example = pageExample(wordExample(row), links, sentencesScreen)
  expect(example.tokens.filter(token => 'meaning' in token)).toEqual([])
  expect(example.romaji).toBe(row.example.romaji)
})
