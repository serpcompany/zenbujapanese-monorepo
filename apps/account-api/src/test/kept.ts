import { randomUUID } from 'node:crypto'
import { searchKeys } from '../domain/cursor'
import { searchIdOf } from '../domain/recent-searches'
import type { Learner, useAccountService } from './accounts'
import { uploaded } from './photos'
import { testSecret } from './service'

export const searchIdFor = (learner: Learner, query: string) =>
  searchIdOf(searchKeys(testSecret)(learner.userId), query)

const item = '0'.repeat(32)
const savedAt = '2026-10-01T12:00:00Z'

export async function oneOfEachKept(
  accounts: ReturnType<typeof useAccountService>,
  learner: Learner
) {
  const photoId = await uploaded(accounts, learner)
  const profilePhotoId = await uploaded(accounts, learner)
  const appOnly = [
    {
      entity: 'wordNote',
      operation: 'write',
      entityId: randomUUID(),
      baseVersion: 0,
      fields: { item, text: 'Mine.' }
    },
    { entity: 'photo', operation: 'add', entityId: photoId, fields: { name: 'x', savedAt } },
    {
      entity: 'photoWord',
      operation: 'add',
      entityId: `${photoId}/${item}`,
      fields: { headword: '見る', savedAt }
    },
    {
      entity: 'setting',
      operation: 'set',
      entityId: 'readingAids.romaji',
      baseVersion: 0,
      fields: { value: true }
    },
    {
      entity: 'recentSearch',
      operation: 'search',
      entityId: searchIdFor(learner, '見る'),
      baseVersion: 0,
      fields: { query: '見る', searchedAt: savedAt }
    }
  ]
  const profilePhoto = {
    entity: 'profilePhoto',
    operation: 'set',
    baseVersion: 0,
    fields: { photoId: profilePhotoId }
  }
  return { photoId, appOnly, profilePhoto }
}

export const keptTables = [
  'word_notes',
  'photos',
  'photo_words',
  'photo_files',
  'profile_photos',
  'learner_settings',
  'recent_searches'
]
