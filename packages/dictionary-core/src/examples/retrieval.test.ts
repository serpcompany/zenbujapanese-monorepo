import { describe, expect, test } from 'vitest'
import {
  compareRanks,
  graphemePosition,
  LexicalRelation,
  normalizedEntryEvidence
} from './retrieval'

describe('compareRanks', () => {
  const rank = (relation: number, position: number, graphemeCount: number, pairId: string) => ({
    relation,
    position,
    graphemeCount,
    pairId
  })

  test('orders by relation, then position, then length, then pair ID', () => {
    const ranked = [
      rank(LexicalRelation.reading, 0, 5, 'a'),
      rank(LexicalRelation.selectedWrittenForm, 3, 5, 'a'),
      rank(LexicalRelation.selectedWrittenForm, 1, 9, 'a'),
      rank(LexicalRelation.selectedWrittenForm, 1, 4, 'b'),
      rank(LexicalRelation.selectedWrittenForm, 1, 4, 'a'),
      rank(LexicalRelation.alternateWrittenForm, 0, 1, 'a')
    ].sort(compareRanks)
    expect(
      ranked.map(({ relation, position, graphemeCount, pairId }) => [
        relation,
        position,
        graphemeCount,
        pairId
      ])
    ).toEqual([
      [4, 1, 4, 'a'],
      [4, 1, 4, 'b'],
      [4, 1, 9, 'a'],
      [4, 3, 5, 'a'],
      [5, 0, 1, 'a'],
      [6, 0, 5, 'a']
    ])
  })
})

test('graphemePosition counts graphemes, not UTF-16 units, before the first occurrence', () => {
  const flag = String.fromCodePoint(0x1f1ef, 0x1f1f5)
  expect(graphemePosition('見る', `${flag}を見る`)).toBe(2)
  expect(graphemePosition('見る', '見る')).toBe(0)
  expect(graphemePosition('見る', '見た')).toBeNull()
})

test('normalizedEntryEvidence is NFKC with whitespace runs collapsed', () => {
  expect(normalizedEntryEvidence('ＣＤ　プレーヤー')).toBe('CD プレーヤー')
  expect(normalizedEntryEvidence(' ｶﾞ ')).toBe('ガ')
})
