import { describe, expect, test } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { aJpeg, uploaded } from '../test/photos'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const word = (n: number) => n.toString(16).padStart(32, '0')
const savedAt = '2026-10-01T12:00:00.000Z'

const add = (photoId: string, name = 'Menu.jpg') => ({
  entity: 'photo',
  operation: 'add',
  entityId: photoId,
  fields: { name, savedAt }
})
const drop = (photoId: string) => ({ entity: 'photo', operation: 'delete', entityId: photoId })
const onWord = (photoId: string, n: number) => ({
  entity: 'photoWord',
  operation: 'add',
  entityId: `${photoId}/${word(n)}`,
  fields: { headword: '見る', reading: 'みる', savedAt }
})
const offWord = (photoId: string, n: number, baseVersion: number) => ({
  entity: 'photoWord',
  operation: 'remove',
  entityId: `${photoId}/${word(n)}`,
  baseVersion
})

const results = accounts.results
const changes = async (learner: Learner) =>
  (await accounts.mutate(learner.token)).changes.filter(change =>
    ['photo', 'photoWord'].includes(change.entity)
  )
const rows = (sql: string) => accounts.running.service.rows(sql)
const fileCount = async (learner: Learner) =>
  (await rows(`select count(*)::int as n from photo_files where user_id = '${learner.userId}'`))[0]
    ?.n
const dueDeletions = async () =>
  (await rows('select count(*)::int as n from photo_file_deletions where due_at <= now()'))[0]?.n

describe('Media Library photos', () => {
  test('a photo needs its file first, then an add puts it in the account, and adding it again changes nothing', async () => {
    const learner = await accounts.learner('photo-add@example.com')
    const photoId = await uploaded(accounts, learner)
    const missing = 'f'.repeat(64)
    expect(
      await results(
        learner,
        add(missing),
        add(photoId),
        add(photoId, 'Renamed.jpg'),
        onWord(photoId, 1)
      )
    ).toMatchObject([
      { status: 'rejected', error: { code: 'photo_not_uploaded' } },
      { status: 'applied', version: 1 },
      { status: 'applied', version: 1 },
      { status: 'applied', version: 1 }
    ])
    expect(await changes(learner)).toEqual([
      {
        entity: 'photo',
        entityId: photoId,
        operation: 'put',
        version: 1,
        data: { id: photoId, name: 'Menu.jpg', savedAt }
      },
      {
        entity: 'photoWord',
        entityId: `${photoId}/${word(1)}`,
        operation: 'put',
        version: 1,
        data: { photoId, itemId: word(1), headword: '見る', reading: 'みる', savedAt }
      }
    ])
  })

  test('a word goes only on a photo the account has, up to 500, and a remove that never saw an add loses to it', async () => {
    const learner = await accounts.learner('photo-words@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(learner, add(photoId), onWord(photoId, 1), onWord(photoId, 2))
    expect(
      await results(
        learner,
        onWord('e'.repeat(64), 1),
        offWord(photoId, 2, 0),
        offWord(photoId, 9, 0)
      )
    ).toMatchObject([
      { status: 'rejected', error: { code: 'unknown_photo' } },
      { status: 'conflict', version: 1, current: { operation: 'put' } },
      { status: 'applied', version: 0 }
    ])
    await rows(
      `insert into photo_words (user_id, photo_id, item_id, headword, reading, saved_at, present, version) select '${learner.userId}', '${photoId}', lpad(to_hex(n + 100), 32, '0'), 'x', '', now(), true, 1 from generate_series(1, 498) as n`
    )
    expect(await results(learner, onWord(photoId, 3), onWord(photoId, 1))).toMatchObject([
      { status: 'rejected', error: { code: 'photo_full' } },
      { status: 'applied', version: 1 }
    ])
  })

  test('removing the last word deletes the photo and its file, as the app does', async () => {
    const learner = await accounts.learner('photo-last-word@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(learner, add(photoId), onWord(photoId, 1), onWord(photoId, 2))
    await results(learner, offWord(photoId, 1, 1))
    expect(await fileCount(learner)).toBe(1)
    expect(await results(learner, offWord(photoId, 2, 1))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await changes(learner)).toEqual(
      expect.arrayContaining([
        { entity: 'photo', entityId: photoId, operation: 'delete', version: 2, data: null }
      ])
    )
    expect(await fileCount(learner)).toBe(0)
    expect(await dueDeletions()).toBeGreaterThan(0)
    await accounts.running.service.files.sweep()
    expect(await dueDeletions()).toBe(0)
  })

  test('a delete wins over words added since, takes them and the file, and the same photo saved again comes back', async () => {
    const learner = await accounts.learner('photo-delete@example.com')
    const bytes = aJpeg()
    const photoId = await uploaded(accounts, learner, bytes)
    await results(learner, add(photoId), onWord(photoId, 1))
    await results(learner, onWord(photoId, 2))
    expect(
      await results(learner, drop(photoId), drop(photoId), drop('d'.repeat(64)))
    ).toMatchObject([
      { status: 'applied', version: 2 },
      { status: 'applied', version: 2 },
      { status: 'applied', version: 0 }
    ])
    expect(await changes(learner)).toEqual([
      { entity: 'photo', entityId: photoId, operation: 'delete', version: 2, data: null }
    ])
    expect(
      await rows(`select count(*)::int as n from photo_words where user_id = '${learner.userId}'`)
    ).toEqual([{ n: 0 }])
    expect(await fileCount(learner)).toBe(0)
    expect(await results(learner, onWord(photoId, 3), add(photoId))).toMatchObject([
      { status: 'rejected', error: { code: 'unknown_photo' } },
      { status: 'rejected', error: { code: 'photo_not_uploaded' } }
    ])
    await uploaded(accounts, learner, bytes)
    expect(await results(learner, add(photoId))).toMatchObject([{ status: 'applied', version: 3 }])
  })

  test('refuses a bad ID or fields', async () => {
    const learner = await accounts.learner('photo-fields@example.com')
    const photoId = await uploaded(accounts, learner)
    const answer = await results(
      learner,
      add('ABC'),
      { ...add(photoId), fields: { name: 'x' } },
      { ...add(photoId), fields: { name: 7, savedAt } },
      { ...add(photoId), fields: { name: 'x', savedAt, words: 2 } },
      { ...onWord(photoId, 1), entityId: photoId },
      { ...onWord(photoId, 1), entityId: `${photoId}/kanji:ab` },
      { ...offWord(photoId, 1, 0), baseVersion: undefined }
    )
    expect(answer.map(result => result.error?.code)).toEqual([
      'invalid_mutation',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation',
      'invalid_mutation',
      'invalid_mutation'
    ])
    await results(learner, add(photoId))
    const words = await results(
      learner,
      { ...onWord(photoId, 1), fields: { headword: '見る' } },
      { ...onWord(photoId, 1), fields: { headword: '', savedAt } },
      { ...onWord(photoId, 1), fields: { headword: '見る', savedAt, note: 'x' } }
    )
    expect(words.map(result => result.error?.code)).toEqual([
      'invalid_fields',
      'invalid_fields',
      'invalid_fields'
    ])
    const [named] = await rows(`select name from photos where id = '${photoId}'`)
    expect(named).toEqual({ name: 'Menu.jpg' })
  })
})

test('two devices converge on photos and their words, and one that dropped a photo gets it back with a word', async () => {
  const learner = await accounts.learner('photo-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  const [kept, contested] = [await uploaded(accounts, learner), await uploaded(accounts, learner)]
  for (const photoId of [kept, contested]) {
    phone.change('photo', 'add', photoId, { name: 'Shot.jpg', savedAt })
    phone.change('photoWord', 'add', `${photoId}/${word(1)}`, onWord(photoId, 1).fields)
  }
  await phone.sync()
  await pad.sync()

  pad.change('photoWord', 'add', `${contested}/${word(2)}`, onWord(contested, 2).fields)
  await pad.sync()
  phone.change('photoWord', 'remove', `${contested}/${word(1)}`)
  phone.local.delete(`photo:${contested}`)
  await phone.sync()
  await pad.sync()

  expect(pad.state()).toEqual(phone.state())
  expect(phone.dataOf('photo', contested)).toMatchObject({ name: 'Shot.jpg' })
  expect(phone.dataOf('photoWord', `${contested}/${word(2)}`)).toMatchObject({ headword: '見る' })
  expect(phone.dataOf('photoWord', `${kept}/${word(1)}`)).toMatchObject({ headword: '見る' })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
