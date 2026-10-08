export const browsePageSize = 200

export const rankedListLimit = 10_000

export const rankBandSize = 1_000

export const rankBands = rankedListLimit / rankBandSize

export const maximumBrowsePage = 10_000

export const minimumIndexedWords = 10

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / browsePageSize))

export interface RankBand {
  band: number
  first: number
  last: number
}

export const rankBand = (band: number): RankBand => ({
  band,
  first: (band - 1) * rankBandSize + 1,
  last: band * rankBandSize
})

export const allRankBands: readonly RankBand[] = Array.from({ length: rankBands }, (_, index) =>
  rankBand(index + 1)
)

type RankedListSource = { kind: 'tubelex' } | { kind: 'pack'; packId: string }

export interface RankedList {
  slug: string
  name: string
  chip: string
  source: RankedListSource
}

const jitenPack = (name: string) => ({
  kind: 'pack' as const,
  packId: `zenbu.jiten.${name}.ja.ordered-v2`
})

export const rankedLists: readonly RankedList[] = [
  { slug: 'youtube', name: 'YouTube', chip: 'YouTube', source: { kind: 'tubelex' } },
  {
    slug: 'wikipedia',
    name: 'Wikipedia',
    chip: 'Wikipedia',
    source: { kind: 'pack', packId: 'zenbu.wikipedia.written.ja.unidic-3.1' }
  },
  {
    slug: 'tv-and-movies',
    name: 'TV and movies',
    chip: 'TV & Movies',
    source: jitenPack('tv-movies')
  },
  { slug: 'anime', name: 'Anime', chip: 'Anime', source: jitenPack('anime') },
  { slug: 'manga', name: 'Manga', chip: 'Manga', source: jitenPack('manga') },
  { slug: 'novels', name: 'Novels', chip: 'Novels', source: jitenPack('novels') },
  {
    slug: 'visual-novels',
    name: 'Visual novels',
    chip: 'Visual Novels',
    source: jitenPack('visual-novels')
  },
  { slug: 'video-games', name: 'Video games', chip: 'Games', source: jitenPack('video-games') }
]

export const rankedPackIds = rankedLists.flatMap(({ source }) =>
  source.kind === 'pack' ? [source.packId] : []
)

export interface JlptList {
  slug: string
  name: string
  level: number
}

export const jlptLists: readonly JlptList[] = [5, 4, 3, 2, 1].map(level => ({
  slug: `jlpt-n${level}`,
  name: `JLPT N${level}`,
  level
}))

export const rankedList = (slug: string) => rankedLists.find(list => list.slug === slug)

export const jlptList = (slug: string) => jlptLists.find(list => list.slug === slug)

export interface KanjiList {
  slug: string
  name: string
  grades?: readonly number[]
  strokes?: number
  jlptLevel?: number
}

export const joyoGrades: readonly number[] = [1, 2, 3, 4, 5, 6, 8]

export const gradeLists: readonly KanjiList[] = [1, 2, 3, 4, 5, 6].map(grade => ({
  slug: `grade-${grade}`,
  name: `Grade ${grade}`,
  grades: [grade]
}))

export const secondarySchool: KanjiList = {
  slug: 'secondary-school',
  name: 'Secondary school',
  grades: [8]
}

export const jinmeiyo: KanjiList = { slug: 'jinmeiyo', name: 'Jinmeiyō', grades: [9, 10] }

export const strokeList = (strokes: number): KanjiList => ({
  slug: `strokes-${strokes}`,
  name: `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`,
  grades: joyoGrades,
  strokes
})

export const schoolLists: readonly KanjiList[] = [...gradeLists, secondarySchool, jinmeiyo]

export const jlptKanjiLists: readonly KanjiList[] = jlptLists.map(({ slug, name, level }) => ({
  slug,
  name,
  jlptLevel: level
}))

export function kanjiList(slug: string): KanjiList | undefined {
  const strokes = slug.match(/^strokes-([1-9]\d?)$/u)
  if (strokes) return strokeList(Number(strokes[1]))
  return [...schoolLists, ...jlptKanjiLists].find(list => list.slug === slug)
}
