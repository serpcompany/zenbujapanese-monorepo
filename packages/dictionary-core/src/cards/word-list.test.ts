import { describe, expect, test } from 'vitest'
import { parseWordList } from './word-list'

describe('parseWordList, a word list as Tomodachi keeps it', () => {
  test('reads a Language Reference ID, or a headword and its reading, one to a line', () => {
    expect(
      parseWordList('7F490A9C9C0DA94F4E9474F4EFE74BE1\n見る\tみる\n\n  \nいる\tいる\r\n')
    ).toEqual({
      queries: [
        { languageReferenceID: '7f490a9c9c0da94f4e9474f4efe74be1' },
        { headword: '見る', reading: 'みる' },
        { headword: 'いる', reading: 'いる' }
      ],
      unreadable: []
    })
  })

  test('reports each line it can read as neither, by its number', () => {
    expect(parseWordList('見る\nabc\n見る\tみる\textra\n\tみる').unreadable).toEqual([
      { line: 1, text: '見る' },
      { line: 2, text: 'abc' },
      { line: 3, text: '見る\tみる\textra' },
      { line: 4, text: '\tみる' }
    ])
  })
})
