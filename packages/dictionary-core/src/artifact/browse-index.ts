import { type BrowseCategory, browseCategories, senseLabelKeys } from '../browse/categories'
import type { ArtifactDatabase } from './database'

export interface KanaCount {
  kana: string
  count: number
}

export interface CategoryCount {
  slug: string
  count: number
}

export type CategoryOrder = 'used' | 'kana'

export interface CategoryMembers {
  used: Int32Array
  kana: Int32Array
  labelledSense: ReadonlyMap<number, number>
}

type FirstSenses = Map<number, number>

const senseLabels = { partOfSpeech: 'partsOfSpeech', ...senseLabelKeys } as const

const maximumSenses = 1_024

function labelledSenses(db: ArtifactDatabase): Map<string, FirstSenses> {
  const senses = new Map<string, FirstSenses>()
  for (const [kind, key] of Object.entries(senseLabels)) {
    for (const { rowid, label, sense } of db.all<{ rowid: number; label: string; sense: number }>(
      `SELECT e.rowid AS rowid, l.value AS label, min(s.key) AS sense
       FROM entries e, json_each(e.senses_json) s, json_each(s.value, '$.${key}') l
       WHERE e.senses_json LIKE ? GROUP BY e.rowid, l.value`,
      [`%"${key}":%`]
    )) {
      const name = `${kind}:${label}`
      const members = senses.get(name) ?? new Map<number, number>()
      members.set(rowid, sense)
      senses.set(name, members)
    }
  }
  return senses
}

function categorySenses(category: BrowseCategory, senses: Map<string, FirstSenses>): FirstSenses {
  const merged: FirstSenses = new Map()
  for (const label of category.labels) {
    for (const [rowid, sense] of senses.get(`${category.kind}:${label}`) ?? []) {
      merged.set(rowid, Math.min(sense, merged.get(rowid) ?? sense))
    }
  }
  return merged
}

function categoryFirstSenses(db: ArtifactDatabase): FirstSenses[] {
  const senses = labelledSenses(db)
  const common = db.all<{ rowid: number }>('SELECT rowid FROM entries WHERE is_common = 1')
  return browseCategories.map(category =>
    category.kind === 'common'
      ? new Map(common.map(({ rowid }) => [rowid, 0]))
      : categorySenses(category, senses)
  )
}

function append<Key, Value>(lists: Map<Key, Value[]>, key: Key, value: Value) {
  const list = lists.get(key)
  if (list) list.push(value)
  else lists.set(key, [value])
}

interface MostUsedOrder {
  firstMeaning: number[]
  laterMeaning: number[]
  unranked: number[]
}

export class BrowseIndex {
  private readonly readAlone = new Map<string, number[]>()
  private readonly byPrefix = new Map<string, number[]>()
  private readonly prefixCounts = new Map<string, KanaCount[]>()
  private readonly byCategory = new Map<string, CategoryMembers>()

  constructor(db: ArtifactDatabase) {
    const inKanaOrder = db
      .all<{ rowid: number; reading: string }>(
        'SELECT e.rowid AS rowid, e.reading AS reading FROM entries e ORDER BY e.reading, e.source_record_id'
      )
      .map(({ rowid, reading }) => {
        const kana = Array.from(reading)
        if (kana.length === 1) append(this.readAlone, reading, rowid)
        if (kana.length > 1) append(this.byPrefix, kana.slice(0, 2).join(''), rowid)
        return rowid
      })
    for (const [prefix, listed] of this.byPrefix) {
      append(this.prefixCounts, Array.from(prefix)[0], { kana: prefix, count: listed.length })
    }
    const firstSenses = categoryFirstSenses(db)
    const memberships = new Map<number, number[]>()
    firstSenses.forEach((members, category) => {
      for (const [rowid, sense] of members) {
        append(memberships, rowid, category * maximumSenses + sense)
      }
    })
    const mostUsed = browseCategories.map(
      (): MostUsedOrder => ({ firstMeaning: [], laterMeaning: [], unranked: [] })
    )
    for (const { rowid, ranked } of db.all<{ rowid: number; ranked: number }>(
      `SELECT e.rowid AS rowid, t.rank IS NOT NULL AS ranked FROM entries e
       LEFT JOIN tubelex.frequency_evidence t ON t.language_reference_id = e.id
       ORDER BY t.rank IS NULL, t.rank, e.reading, e.source_record_id`
    )) {
      for (const packed of memberships.get(rowid) ?? []) {
        const order = mostUsed[Math.floor(packed / maximumSenses)]
        if (!ranked) order.unranked.push(rowid)
        else if (packed % maximumSenses === 0) order.firstMeaning.push(rowid)
        else order.laterMeaning.push(rowid)
      }
    }
    const kanaOrder = browseCategories.map((): number[] => [])
    for (const rowid of inKanaOrder) {
      for (const packed of memberships.get(rowid) ?? []) {
        kanaOrder[Math.floor(packed / maximumSenses)].push(rowid)
      }
    }
    browseCategories.forEach((category, index) => {
      if (kanaOrder[index].length === 0) return
      const { firstMeaning, laterMeaning, unranked } = mostUsed[index]
      this.byCategory.set(category.slug, {
        used: Int32Array.from([...firstMeaning, ...laterMeaning, ...unranked]),
        kana: Int32Array.from(kanaOrder[index]),
        labelledSense: new Map([...firstSenses[index]].filter(([, sense]) => sense > 0))
      })
    })
  }

  readAs(kana: string): number[] {
    return this.readAlone.get(kana) ?? []
  }

  startingWith(prefix: string): number[] {
    return this.byPrefix.get(prefix) ?? []
  }

  prefixesOf(initial: string): KanaCount[] {
    return this.prefixCounts.get(initial) ?? []
  }

  category(slug: string): CategoryMembers | null {
    return this.byCategory.get(slug) ?? null
  }

  categoryCounts(): CategoryCount[] {
    return browseCategories.flatMap(({ slug }) => {
      const listed = this.byCategory.get(slug)
      return listed ? [{ slug, count: listed.used.length }] : []
    })
  }
}
