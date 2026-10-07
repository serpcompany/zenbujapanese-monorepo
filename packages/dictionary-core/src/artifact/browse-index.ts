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

type Members = Map<string, Set<number>>

function addMembers(members: Members, kind: string, rows: { rowid: number; label: string }[]) {
  for (const { rowid, label } of rows) {
    const key = `${kind}:${label}`
    const set = members.get(key) ?? new Set<number>()
    set.add(rowid)
    members.set(key, set)
  }
}

function labelMembers(db: ArtifactDatabase): Members {
  const members: Members = new Map()
  addMembers(
    members,
    'partOfSpeech',
    db.all(
      `SELECT e.rowid AS rowid, p.value AS label
       FROM entries e, json_each(e.parts_of_speech_json) p`
    )
  )
  for (const [kind, key] of Object.entries(senseLabelKeys)) {
    addMembers(
      members,
      kind,
      db.all(
        `SELECT e.rowid AS rowid, l.value AS label
         FROM entries e, json_each(e.senses_json) s, json_each(s.value, '$.${key}') l
         WHERE e.senses_json LIKE ?`,
        [`%"${key}":%`]
      )
    )
  }
  return members
}

function categoryMembers(category: BrowseCategory, members: Members): Set<number> {
  const sets = category.labels.flatMap(label => members.get(`${category.kind}:${label}`) ?? [])
  return sets.length === 1 ? sets[0] : new Set(sets.flatMap(set => [...set]))
}

function append<Key, Value>(lists: Map<Key, Value[]>, key: Key, value: Value) {
  const list = lists.get(key)
  if (list) list.push(value)
  else lists.set(key, [value])
}

const rowids = (rows: { rowid: number }[]) => rows.map(row => row.rowid)

export class BrowseIndex {
  private readonly readAlone = new Map<string, number[]>()
  private readonly byPrefix = new Map<string, number[]>()
  private readonly prefixCounts = new Map<string, KanaCount[]>()
  private readonly byCategory = new Map<string, number[]>()

  constructor(db: ArtifactDatabase) {
    for (const { rowid, reading } of db.all<{ rowid: number; reading: string }>(
      'SELECT e.rowid AS rowid, e.reading AS reading FROM entries e ORDER BY e.reading, e.source_record_id'
    )) {
      const kana = Array.from(reading)
      if (kana.length === 1) append(this.readAlone, reading, rowid)
      if (kana.length > 1) append(this.byPrefix, kana.slice(0, 2).join(''), rowid)
    }
    for (const [prefix, listed] of this.byPrefix) {
      const [initial] = Array.from(prefix)
      const counts = this.prefixCounts.get(initial) ?? []
      counts.push({ kana: prefix, count: listed.length })
      this.prefixCounts.set(initial, counts)
    }
    const mostUsed = rowids(
      db.all(
        `SELECT e.rowid AS rowid FROM entries e
         LEFT JOIN tubelex.frequency_evidence t ON t.language_reference_id = e.id
         ORDER BY t.rank IS NULL, t.rank, e.reading, e.source_record_id`
      )
    )
    const members = labelMembers(db)
    const common = rowids(db.all('SELECT rowid FROM entries WHERE is_common = 1'))
    const categoriesOf = new Map<number, string[]>()
    for (const category of browseCategories) {
      const listed = category.kind === 'common' ? common : categoryMembers(category, members)
      for (const rowid of listed) append(categoriesOf, rowid, category.slug)
    }
    for (const rowid of mostUsed) {
      for (const slug of categoriesOf.get(rowid) ?? []) append(this.byCategory, slug, rowid)
    }
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

  category(slug: string): number[] {
    return this.byCategory.get(slug) ?? []
  }

  categoryCounts(): CategoryCount[] {
    return browseCategories.flatMap(({ slug }) => {
      const listed = this.byCategory.get(slug)
      return listed ? [{ slug, count: listed.length }] : []
    })
  }
}
