import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import type { Learner, useAccountService } from './accounts'

export const examplePhotoFiles = {
  library: Uint8Array.from(Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex')),
  profile: Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'))
}

export const photoIdOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export const wordItem = (n: number) => n.toString(16).padStart(32, '0')
export const photoSavedAt = '2026-10-01T12:00:00.000Z'
export const photoWordFields = { headword: '見る', reading: 'みる', savedAt: photoSavedAt }

export const photoChanges = {
  add: (photoId: string, name = 'Menu.jpg') => ({
    entity: 'photo',
    operation: 'add',
    entityId: photoId,
    fields: { name, savedAt: photoSavedAt }
  }),
  drop: (photoId: string) => ({ entity: 'photo', operation: 'delete', entityId: photoId }),
  onWord: (photoId: string, n: number) => ({
    entity: 'photoWord',
    operation: 'add',
    entityId: `${photoId}/${wordItem(n)}`,
    fields: photoWordFields
  }),
  offWord: (photoId: string, n: number, baseVersion: number) => ({
    entity: 'photoWord',
    operation: 'remove',
    entityId: `${photoId}/${wordItem(n)}`,
    baseVersion
  })
}

let made = 0

export function aJpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  new DataView(bytes.buffer).setUint32(4, made++)
  return bytes
}

export async function uploaded(
  accounts: ReturnType<typeof useAccountService>,
  learner: Learner,
  bytes: Uint8Array = aJpeg()
) {
  const photoId = photoIdOf(bytes)
  const answer = await accounts.running.service.sendPhoto(learner.token, photoId, bytes)
  expect([200, 201], await answer.clone().text()).toContain(answer.status)
  return photoId
}
