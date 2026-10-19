import { describe, expect, test } from 'vitest'
import {
  contextBeforeMatch,
  excerptLength,
  type LearnerNote,
  notesInSearch,
  notesInSearchTitle
} from './notes'

const taberu = '042e07f7052f611fed33ddddf37f55fd'

const note = (text: string, on: Partial<LearnerNote> = {}): LearnerNote => ({
  key: taberu,
  id: '1',
  text,
  headword: '食べる',
  reading: 'たべる',
  ...on
})

const rows = (query: string, ...notes: LearnerNote[]) => notesInSearch({ query, notes })?.rows ?? []

const shown = (query: string, text: string) => {
  const [row] = rows(query, note(text))
  return row && { before: row.before, match: row.match, after: row.after }
}

describe('notesInSearch', () => {
  test('lists a note with the query anywhere in it under its word, with the part that matched', () => {
    expect(notesInSearch({ query: 'squish', notes: [note('to squish flat')] })).toEqual({
      title: notesInSearchTitle,
      rows: [
        {
          key: taberu,
          id: '1',
          headword: '食べる',
          reading: 'たべる',
          before: 'to ',
          match: 'squish',
          after: ' flat'
        }
      ]
    })
    expect(notesInSearchTitle).toBe('In your notes')
  })

  test('folds a note as Search folds a query: width, case, and a halfwidth kana with its mark', () => {
    expect(shown('squish', 'To ＳＱＵＩＳＨ')).toEqual({
      before: 'To ',
      match: 'ＳＱＵＩＳＨ',
      after: ''
    })
    expect(shown('ＳＱＵＩＳＨ', 'to squish')).toEqual({
      before: 'to ',
      match: 'squish',
      after: ''
    })
    expect(shown('ガッコウ', 'ｶﾞｯｺｳで習った')).toEqual({
      before: '',
      match: 'ｶﾞｯｺｳ',
      after: 'で習った'
    })
    expect(shown('ｶﾞｯｺｳ', 'ガッコウで')).toEqual({ before: '', match: 'ガッコウ', after: 'で' })
    expect(rows('がっこう', note('ガッコウ'))).toEqual([])
  })

  test('reads white space of any kind as one space between words', () => {
    expect(shown('to squish', 'to\n\n squish\u{3000}flat')).toEqual({
      before: '',
      match: 'to squish',
      after: ' flat'
    })
  })

  test('shows the character the match is part of, as it was written', () => {
    expect(shown('会社', '㍿の略')).toEqual({ before: '', match: '㍿', after: 'の略' })
  })

  test('lists one note on several words once for each word', () => {
    const onBoth = [
      note('plmqz on both', { key: 'b2', headword: 'い', reading: 'い' }),
      note('plmqz on both', { key: 'a1', headword: 'あ', reading: 'あ' })
    ]
    expect(rows('plmqz', ...onBoth).map(row => [row.key, row.headword])).toEqual([
      ['a1', 'あ'],
      ['b2', 'い']
    ])
  })

  test('lists a note that is the query first, then one that starts with it, then the rest', () => {
    const listed = rows(
      'plmqz',
      note('a plmqz', { key: 'contains-later', headword: 'う' }),
      note('plmqz, then more', { key: 'starts', headword: 'お' }),
      note('another plmqz', { key: 'contains', headword: 'あ' }),
      note('ＰＬＭＱＺ', { key: 'is', headword: 'え' })
    )
    expect(listed.map(row => row.key)).toEqual(['is', 'starts', 'contains', 'contains-later'])
  })

  test('cuts a long note to the part around the match, at a word where it can', () => {
    const before = 'one two three four five six seven eight nine ten eleven '
    const after = ' and then a great many more words follow it to the very end of this long note'
    expect(shown('plmqz', `${before}plmqz${after}`)).toEqual({
      before: '…nine ten eleven ',
      match: 'plmqz',
      after: ' and then a great many more words follow it to the very…'
    })
  })

  test('cuts a note without spaces by characters', () => {
    const excerpt = shown('ぷるぷる', `${'あ'.repeat(30)}ぷるぷる${'い'.repeat(100)}`)
    expect(excerpt).toEqual({
      before: `…${'あ'.repeat(contextBeforeMatch)}`,
      match: 'ぷるぷる',
      after: `${'い'.repeat(excerptLength - contextBeforeMatch - 4)}…`
    })
  })

  test('shows the word that matched when how a letter folds depends on the word around it', () => {
    expect(shown('οδος', 'ΟΔΟΣ')).toEqual({ before: '', match: 'ΟΔΟΣ', after: '' })
    expect(shown('ος', 'το ΟΔΟΣ μου')).toEqual({ before: 'το ', match: 'ΟΔΟΣ', after: ' μου' })
    expect(shown('squish', 'ΟΔΟΣ squish')).toEqual({
      before: 'ΟΔΟΣ ',
      match: 'squish',
      after: ''
    })
  })

  test('shows a note from its start when no part of it can be told to be the match', () => {
    expect(shown('a b', 'a\n\u{3099}b')).toEqual({ before: '', match: '', after: 'a \u{3099}b' })
  })

  test('lists nothing for a query no note has, or one with no words', () => {
    expect(notesInSearch({ query: 'squish', notes: [note('flat')] })).toBeNull()
    expect(notesInSearch({ query: ' \u{3000}\n', notes: [note('to squish')] })).toBeNull()
    expect(notesInSearch({ query: 'squish', notes: [] })).toBeNull()
  })
})
