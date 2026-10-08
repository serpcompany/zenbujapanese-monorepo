import {
  applied,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  momentOf,
  needsBaseVersion,
  plainText,
  rejected,
  uuidOf
} from './entities'
import { isRejection, type Rejection, rejection } from './profile'
import type { Bookmark, LockedAccount } from './store'

export const bookmarkLimits = {
  bookmarks: 2_000,
  textLength: 2_000,
  translationLength: 4_000
} as const

const languages = new Set(['ja', 'en'])
const badBookmark = rejection(
  'invalid_mutation',
  "A bookmarked sentence's entityId is the sentence's UUID."
)
const badFields = rejection(
  'invalid_fields',
  `A bookmark has text (cut to ${bookmarkLimits.textLength} characters), its translation (a string cut to ${bookmarkLimits.translationLength} characters, or null), language (\`ja\` or \`en\`), and bookmarkedAt, an ISO 8601 time. Nothing else.`
)
const tooMany = rejection(
  'too_many_bookmarks',
  `An account holds at most ${bookmarkLimits.bookmarks} bookmarked sentences.`
)
const allowed = new Set(['text', 'translation', 'language', 'bookmarkedAt'])

const bookmarkIdOf = uuidOf

const asChange = (bookmark: Bookmark): Change =>
  bookmark.present && bookmark.text !== null && bookmark.bookmarkedAt !== null
    ? {
        entity: 'bookmarkedSentence',
        entityId: bookmark.id,
        operation: 'put',
        version: bookmark.version,
        data: {
          id: bookmark.id,
          text: bookmark.text,
          translation: bookmark.translation,
          language: bookmark.language === 'en' ? 'en' : 'ja',
          bookmarkedAt: bookmark.bookmarkedAt
        }
      }
    : gone('bookmarkedSentence', bookmark.id, bookmark.version)

const cut = (raw: string, most: number) => [...plainText(raw)].slice(0, most).join('').trim()

function bookmarkFields(
  fields: Record<string, unknown>
): Pick<Bookmark, 'text' | 'translation' | 'language' | 'bookmarkedAt'> | Rejection {
  if (Object.keys(fields).some(key => !allowed.has(key))) return badFields
  const { text, translation = null, language } = fields
  const bookmarkedAt = momentOf(fields.bookmarkedAt)
  if (typeof text !== 'string' || (translation !== null && typeof translation !== 'string')) {
    return badFields
  }
  if (typeof language !== 'string' || !languages.has(language) || !bookmarkedAt) return badFields
  const kept = cut(text, bookmarkLimits.textLength)
  if (kept === '') return badFields
  const translated = translation === null ? '' : cut(translation, bookmarkLimits.translationLength)
  return {
    text: kept,
    translation: translated === '' ? null : translated,
    language,
    bookmarkedAt
  }
}

async function save(
  account: LockedAccount,
  bookmark: Omit<Bookmark, 'updatedAt'>,
  operation: string
) {
  await account.saveBookmark(bookmark)
  await account.journal({
    entityType: 'bookmarkedSentence',
    entityId: bookmark.id,
    entityVersion: bookmark.version,
    operation
  })
  return applied(bookmark.version)
}

async function add(account: LockedAccount, mutation: ClientMutation) {
  const id = bookmarkIdOf(mutation.entityId)
  if (!id) return rejected(badBookmark)
  const current = await account.bookmark(id)
  if (current?.present) return applied(current.version)
  const fields = bookmarkFields(mutation.fields ?? {})
  if (isRejection(fields)) return rejected(fields)
  if ((await account.bookmarkCount()) >= bookmarkLimits.bookmarks) return rejected(tooMany)
  return save(
    account,
    { id, ...fields, present: true, version: (current?.version ?? 0) + 1 },
    'add'
  )
}

const writes = ['translations:write'] as const

export const bookmarks: Entity = {
  reads: 'translations:read',
  operations: {
    add: { needs: writes, apply: add },
    remove: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = bookmarkIdOf(mutation.entityId)
        if (!id) return rejected(badBookmark)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const current = await account.bookmark(id)
        if (!current?.present) return applied(current?.version ?? 0)
        if (mutation.baseVersion !== current.version) return conflict(asChange(current))
        const removed = { id, text: null, translation: null, language: null, bookmarkedAt: null }
        return save(account, { ...removed, present: false, version: current.version + 1 }, 'remove')
      }
    }
  },
  async current(reader, entityId) {
    const id = bookmarkIdOf(entityId) ?? entityId
    const bookmark = await reader.bookmark(id)
    return bookmark ? asChange(bookmark) : gone('bookmarkedSentence', id, 0)
  }
}
