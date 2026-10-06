import { type BrowseCategory, browseCategories, senseLabelKeys } from '../browse/categories'
import type { ArtifactDatabase } from './database'

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

function categorySize(category: BrowseCategory, members: Members): number {
  const sets = category.labels.flatMap(label => members.get(`${category.kind}:${label}`) ?? [])
  if (sets.length === 1) return sets[0].size
  return new Set(sets.flatMap(set => [...set])).size
}

export interface CategoryCount {
  slug: string
  count: number
}

export function categoryCounts(db: ArtifactDatabase): CategoryCount[] {
  const members = labelMembers(db)
  const [common] = db.all<{ count: number }>(
    'SELECT count(*) AS count FROM entries WHERE is_common = 1'
  )
  return browseCategories
    .map(category => ({
      slug: category.slug,
      count: category.kind === 'common' ? common.count : categorySize(category, members)
    }))
    .filter(({ count }) => count > 0)
}
