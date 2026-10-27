import { cutText } from '@zenbu/account-rules/text'
import {
  applied,
  badSavedItem,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  itemText,
  journaled,
  listWordEntityId,
  listWordSeparator,
  momentOf,
  needsBaseVersion,
  type Outcome,
  rejected,
  savedItemIdOf,
  sha256IdOf
} from './entities'
import type { Photo, PhotoWord } from './kept-store'
import { photoLimits } from './photo-limits'
import { isRejection, type Rejection, rejection } from './profile'
import type { LockedAccount } from './store'

const badPhoto = rejection(
  'invalid_mutation',
  "A photo's entityId is the SHA-256 of its file, in 64 lowercase hex digits."
)
const badPhotoWord = rejection(
  'invalid_mutation',
  "A photo word's entityId is the photo's SHA-256, a slash, and the item: `<photo>/<item>`."
)
const badPhotoFields = rejection(
  'invalid_fields',
  `A photo has a name (cut to ${photoLimits.nameLength} characters; it may be empty) and savedAt, an ISO 8601 time from 2000 on. Nothing else.`
)
const badWordFields = rejection(
  'invalid_fields',
  'A photo word has headword and reading, as a list word does, and savedAt, an ISO 8601 time from 2000 on. Nothing else.'
)
export const notUploaded = rejection(
  'photo_not_uploaded',
  'The account has no file with that SHA-256 this app may use: upload it with PUT /v1/photos/{photoId} first, then send the change again under a new ID.'
)
const noPhoto = rejection('unknown_photo', 'That photo is not in this account, or was deleted.')
const full = rejection('photo_full', `A photo is on at most ${photoLimits.wordsPerPhoto} words.`)

function photoChange(photo: Photo): Change {
  if (photo.status === 'emptied') {
    return {
      entity: 'photo',
      entityId: photo.id,
      operation: 'delete',
      version: photo.version,
      data: null,
      emptied: true
    }
  }
  return photo.status === 'shown' && photo.name !== null && photo.savedAt !== null
    ? {
        entity: 'photo',
        entityId: photo.id,
        operation: 'put',
        version: photo.version,
        data: { id: photo.id, name: photo.name, savedAt: photo.savedAt }
      }
    : gone('photo', photo.id, photo.version)
}

const photoWordChange = (word: PhotoWord): Change => {
  const entityId = listWordEntityId(word.photoId, word.itemId)
  return word.present
    ? {
        entity: 'photoWord',
        entityId,
        operation: 'put',
        version: word.version,
        data: {
          photoId: word.photoId,
          itemId: word.itemId,
          headword: word.headword,
          reading: word.reading,
          savedAt: word.savedAt
        }
      }
    : gone('photoWord', entityId, word.version)
}

const onlyThese = (fields: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(fields).every(key => names.includes(key))

function photoFields(fields: Record<string, unknown>): Pick<Photo, 'name' | 'savedAt'> | Rejection {
  const savedAt = momentOf(fields.savedAt)
  if (!onlyThese(fields, ['name', 'savedAt']) || !savedAt) return badPhotoFields
  if (typeof fields.name !== 'string') return badPhotoFields
  return { name: cutText(fields.name, photoLimits.nameLength), savedAt }
}

function photoWordIdOf(entityId: string | undefined) {
  const at = (entityId ?? '').indexOf(listWordSeparator)
  if (at < 0) return null
  const photo = sha256IdOf(entityId?.slice(0, at))
  const item = savedItemIdOf(entityId?.slice(at + listWordSeparator.length))
  return photo && item ? { photo, item } : null
}

const badWordId = (mutation: ClientMutation) =>
  rejected(mutation.entityId?.includes(listWordSeparator) ? badSavedItem : badPhotoWord)

async function savePhoto(account: LockedAccount, photo: Omit<Photo, 'updatedAt'>, op: string) {
  await account.savePhoto(photo)
  await account.forgetGonePhotos(photoLimits.goneKept)
  return journaled(account, 'photo', photo.id, photo.version, op)
}

async function saveWord(account: LockedAccount, word: Omit<PhotoWord, 'updatedAt'>, op: string) {
  await account.savePhotoWord(word)
  await account.forgetRemovedPhotoWords(word.photoId, photoLimits.removedWordsPerPhoto)
  return journaled(
    account,
    'photoWord',
    listWordEntityId(word.photoId, word.itemId),
    word.version,
    op
  )
}

export async function emptyPhoto(account: LockedAccount, photo: Photo) {
  return savePhoto(account, { ...photo, status: 'emptied', version: photo.version + 1 }, 'empty')
}

export async function deletePhoto(account: LockedAccount, current: Photo) {
  for (const word of await account.photoWordsOn(current.id)) {
    await saveWord(account, { ...word, present: false, version: word.version + 1 }, 'remove')
  }
  const deleted = { id: current.id, name: null, savedAt: null, status: 'deleted' as const }
  const outcome = await savePhoto(account, { ...deleted, version: current.version + 1 }, 'delete')
  await account.releasePhotoFile(current.id)
  return outcome
}

async function addPhoto(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const id = sha256IdOf(mutation.entityId)
  if (!id) return rejected(badPhoto)
  const current = await account.photo(id)
  if (current?.status === 'shown') return applied(current.version)
  const fields = photoFields(mutation.fields ?? {})
  if (isRejection(fields)) return rejected(fields)
  if (!(await account.photoFile(id))) return rejected(notUploaded)
  const version = (current?.version ?? (await account.forgottenVersion('photo'))) + 1
  return savePhoto(account, { id, ...fields, status: 'shown', version }, 'add')
}

async function addPhotoWord(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const id = photoWordIdOf(mutation.entityId)
  if (!id) return badWordId(mutation)
  const photo = await account.photo(id.photo)
  if (!photo || photo.status === 'deleted') return rejected(noPhoto)
  const current = await account.photoWord(id.photo, id.item)
  if (current?.present) return applied(current.version)
  const fields = mutation.fields ?? {}
  const text = itemText(fields)
  const savedAt = momentOf(fields.savedAt)
  if (!onlyThese(fields, ['headword', 'reading', 'savedAt']) || !savedAt) {
    return rejected(badWordFields)
  }
  if (isRejection(text)) return rejected(text)
  if ((await account.photoWordCount(id.photo)) >= photoLimits.wordsPerPhoto) return rejected(full)
  if (photo.status === 'emptied') {
    await savePhoto(account, { ...photo, status: 'shown', version: photo.version + 1 }, 'add')
  } else {
    await journaled(account, 'photo', photo.id, photo.version, 'word')
  }
  const word = { photoId: id.photo, itemId: id.item, ...text, savedAt, present: true }
  const version = (current?.version ?? (await account.forgottenVersion('photoWord'))) + 1
  return saveWord(account, { ...word, version }, 'add')
}

async function removePhotoWord(account: LockedAccount, mutation: ClientMutation) {
  const id = photoWordIdOf(mutation.entityId)
  if (!id) return badWordId(mutation)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const current = await account.photoWord(id.photo, id.item)
  if (!current?.present) return applied(current?.version ?? 0)
  if (mutation.baseVersion !== current.version) return conflict(photoWordChange(current))
  const outcome = await saveWord(
    account,
    { ...current, present: false, version: current.version + 1 },
    'remove'
  )
  const photo = await account.photo(id.photo)
  if (photo?.status === 'shown' && (await account.photoWordCount(id.photo)) === 0) {
    await emptyPhoto(account, photo)
  }
  return outcome
}

const writes = ['photos:write'] as const

export const photos: Entity = {
  reads: 'photos:read',
  operations: {
    add: { needs: writes, apply: addPhoto },
    delete: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = sha256IdOf(mutation.entityId)
        if (!id) return rejected(badPhoto)
        const current = await account.photo(id)
        if (!current || current.status === 'deleted') return applied(current?.version ?? 0)
        return deletePhoto(account, current)
      }
    }
  },
  async current(reader, entityId) {
    const photo = await reader.photo(entityId)
    return photo ? photoChange(photo) : gone('photo', entityId, 0)
  }
}

export const photoWords: Entity = {
  reads: 'photos:read',
  operations: {
    add: { needs: writes, apply: addPhotoWord },
    remove: { needs: writes, apply: removePhotoWord }
  },
  async current(reader, entityId) {
    const id = photoWordIdOf(entityId)
    const word = id ? await reader.photoWord(id.photo, id.item) : null
    return word ? photoWordChange(word) : gone('photoWord', entityId, 0)
  }
}
