import { type KanjiEntries, kanjiListResponse } from '../artifact/browse-kanji'
import type { KanjiReferenceEntry } from '../artifact/kanji-data'
import { graphemes, hiragana, isKanjiCharacter } from '../detail/text'
import { normalizeQuery } from '../search/query'
import { schoolLists } from './lists'

export interface SchoolKanjiRequest {
  filter: string
  known: string[]
}

interface SchoolKanjiTile {
  character: string
  meaning: string
  known: boolean
}

interface SchoolKanjiSection {
  id: string
  title: string
  count: string
  known: number
  spoken: string
  kanji: SchoolKanjiTile[]
}

export interface SchoolKanjiPanel {
  filtered: boolean
  sections: SchoolKanjiSection[]
}

interface FilteredKanji {
  character: string
  meaning: string
  meanings: string[]
  readings: string[]
}

interface SchoolList {
  id: string
  title: string
  kanji: FilteredKanji[]
}

const counted = new Intl.NumberFormat('en-US')
const kana = /[ぁ-ゖァ-ヺー]/u
const okuriganaMarks = /[.-]/gu

const spokenReadings = (entry: KanjiReferenceEntry | undefined) =>
  (entry?.readings ?? [])
    .filter(({ kind }) => kind !== 'name')
    .map(({ value }) => hiragana(value).replace(okuriganaMarks, ''))

const letter = /\p{L}/u

function startsAWord(meaning: string, query: string): boolean {
  for (let at = meaning.indexOf(query); at !== -1; at = meaning.indexOf(query, at + 1)) {
    if (at === 0 || !letter.test(meaning.charAt(at - 1))) return true
  }
  return false
}

function matcher(filter: string): ((kanji: FilteredKanji) => boolean) | null {
  const query = normalizeQuery(filter)
  if (query === '') return null
  const characters = graphemes(query).filter(isKanjiCharacter)
  if (characters.length > 0) return ({ character }) => characters.includes(character)
  if (kana.test(query)) {
    const reading = hiragana(query)
    return ({ readings }) => readings.some(value => value.startsWith(reading))
  }
  return ({ meanings }) => meanings.some(meaning => startsAWord(meaning, query))
}

export class SchoolKanji {
  private readonly lists: SchoolList[]

  constructor(kanji: KanjiEntries) {
    const entries = new Map(kanji.entries().map(entry => [entry.character, entry]))
    this.lists = schoolLists.map(list => ({
      id: list.slug,
      title: list.name,
      kanji: (kanjiListResponse(kanji, list.slug)?.kanji ?? []).map(({ character, meaning }) => {
        const entry = entries.get(character)
        return {
          character,
          meaning,
          meanings: (entry?.meanings ?? []).map(each => each.toLowerCase()),
          readings: spokenReadings(entry)
        }
      })
    }))
  }

  panel({ filter, known }: SchoolKanjiRequest): SchoolKanjiPanel {
    const matches = matcher(filter)
    const knownKanji = new Set(known)
    const sections = this.lists.flatMap(list => {
      const shown = matches ? list.kanji.filter(matches) : list.kanji
      if (shown.length === 0) return []
      const kanji = shown.map(({ character, meaning }) => ({
        character,
        meaning,
        known: knownKanji.has(character)
      }))
      const knownCount = kanji.filter(tile => tile.known).length
      const total = counted.format(list.kanji.length)
      const count = matches ? `${counted.format(shown.length)} of ${total}` : total
      const spoken = [
        list.title,
        `${count} kanji`,
        ...(knownCount > 0 ? [`${counted.format(knownCount)} known`] : [])
      ].join(', ')
      return [{ id: list.id, title: list.title, count, known: knownCount, spoken, kanji }]
    })
    return { filtered: matches !== null, sections }
  }
}
