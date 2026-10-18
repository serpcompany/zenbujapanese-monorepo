import { jlptKanjiLists, joyoGrades, type KanjiList, kanjiList, schoolLists } from '../browse/lists'
import type { KanjiReferenceEntry, KanjiReferenceFile } from './kanji-data'

type KanjiFacts = Pick<KanjiReferenceEntry, 'meanings' | 'readings'>

export interface KanjiEntries {
  entries(): KanjiReferenceEntry[]
  row(character: string): KanjiFacts | null
}

export function kanjiEntries(file: KanjiReferenceFile): KanjiEntries {
  const byCharacter = new Map(file.entries.map(entry => [entry.character, entry]))
  return { entries: () => file.entries, row: character => byCharacter.get(character) ?? null }
}

export interface KanjiItem {
  character: string
  meaning: string
}

export interface KanjiHubResponse {
  lists: { slug: string; characters: string[] }[]
  jlpt: { slug: string; count: number; first: string[] }[]
  strokes: { strokes: number; count: number }[]
}

const firstJlptKanjiShown = 5

export interface KanjiListResponse {
  slug: string
  kanji: KanjiItem[]
}

const codePoint = (character: string) => character.codePointAt(0) ?? 0

function byFrequency(left: KanjiReferenceEntry, right: KanjiReferenceEntry): number {
  const rank = (entry: KanjiReferenceEntry) => entry.frequencyRank ?? Number.POSITIVE_INFINITY
  return rank(left) - rank(right) || codePoint(left.character) - codePoint(right.character)
}

const listed = (entry: KanjiReferenceEntry, list: KanjiList) =>
  (list.grades === undefined || (entry.grade !== null && list.grades.includes(entry.grade))) &&
  (list.strokes === undefined || entry.strokeCount === list.strokes) &&
  (list.jlptLevel === undefined || entry.wallerJlptLevel === list.jlptLevel)

const kanjiIn = (kanji: KanjiEntries, list: KanjiList) =>
  kanji
    .entries()
    .filter(entry => listed(entry, list))
    .sort(byFrequency)

export function kanjiHub(kanji: KanjiEntries): KanjiHubResponse {
  const lists = schoolLists.map(list => ({
    slug: list.slug,
    characters: kanjiIn(kanji, list).map(entry => entry.character)
  }))
  const jlpt = jlptKanjiLists.map(list => {
    const characters = kanjiIn(kanji, list).map(entry => entry.character)
    return {
      slug: list.slug,
      count: characters.length,
      first: characters.slice(0, firstJlptKanjiShown)
    }
  })
  const counts = new Map<number, number>()
  for (const entry of kanji.entries()) {
    if (entry.grade !== null && joyoGrades.includes(entry.grade)) {
      counts.set(entry.strokeCount, (counts.get(entry.strokeCount) ?? 0) + 1)
    }
  }
  const strokes = [...counts]
    .sort(([left], [right]) => left - right)
    .map(([strokeCount, count]) => ({ strokes: strokeCount, count }))
  return { lists, jlpt, strokes }
}

export function ownOrOrdinary<T>(
  kanji: KanjiEntries,
  character: string,
  pick: (facts: KanjiFacts) => T[]
): T[] {
  const own = kanji.row(character)
  const values = own ? pick(own) : []
  if (values.length > 0) return values
  const ordinary = character.normalize('NFKC')
  const borrowed = ordinary === character ? null : kanji.row(ordinary)
  return borrowed ? pick(borrowed) : []
}

export function kanjiListResponse(kanji: KanjiEntries, slug: string): KanjiListResponse | null {
  const list = kanjiList(slug)
  const entries = list ? kanjiIn(kanji, list) : []
  if (entries.length === 0) return null
  return {
    slug,
    kanji: entries.map(entry => ({
      character: entry.character,
      meaning: ownOrOrdinary(kanji, entry.character, facts => facts.meanings)[0] ?? ''
    }))
  }
}
