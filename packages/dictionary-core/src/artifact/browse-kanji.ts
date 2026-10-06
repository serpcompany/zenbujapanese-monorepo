import {
  gradeLists,
  jinmeiyo,
  joyoGrades,
  type KanjiList,
  kanjiList,
  secondarySchool
} from '../browse/lists'
import type { KanjiData, KanjiReferenceEntry } from './kanji-data'

export interface KanjiItem {
  character: string
  meaning: string
}

export interface KanjiHubResponse {
  lists: { slug: string; characters: string[] }[]
  strokes: { strokes: number; count: number }[]
}

export interface KanjiListResponse {
  slug: string
  kanji: KanjiItem[]
}

const codePoint = (character: string) => character.codePointAt(0) ?? 0

function byFrequency(left: KanjiReferenceEntry, right: KanjiReferenceEntry): number {
  const rank = (entry: KanjiReferenceEntry) => entry.frequencyRank ?? Number.POSITIVE_INFINITY
  return rank(left) - rank(right) || codePoint(left.character) - codePoint(right.character)
}

function kanjiIn(kanji: KanjiData, list: KanjiList): KanjiReferenceEntry[] {
  return kanji
    .entries()
    .filter(
      entry =>
        entry.grade !== null &&
        list.grades.includes(entry.grade) &&
        (list.strokes === undefined || entry.strokeCount === list.strokes)
    )
    .sort(byFrequency)
}

export function kanjiHub(kanji: KanjiData): KanjiHubResponse {
  const lists = [...gradeLists, secondarySchool, jinmeiyo].map(list => ({
    slug: list.slug,
    characters: kanjiIn(kanji, list).map(entry => entry.character)
  }))
  const counts = new Map<number, number>()
  for (const entry of kanji.entries()) {
    if (entry.grade !== null && joyoGrades.includes(entry.grade)) {
      counts.set(entry.strokeCount, (counts.get(entry.strokeCount) ?? 0) + 1)
    }
  }
  const strokes = [...counts]
    .sort(([left], [right]) => left - right)
    .map(([strokeCount, count]) => ({ strokes: strokeCount, count }))
  return { lists, strokes }
}

export function kanjiListResponse(kanji: KanjiData, slug: string): KanjiListResponse | null {
  const list = kanjiList(slug)
  const entries = list ? kanjiIn(kanji, list) : []
  if (entries.length === 0) return null
  return {
    slug,
    kanji: entries.map(entry => ({ character: entry.character, meaning: entry.meanings[0] ?? '' }))
  }
}
