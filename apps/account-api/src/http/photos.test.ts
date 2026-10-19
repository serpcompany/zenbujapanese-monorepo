import { describe, expect, test, vi } from 'vitest'
import { appliedAt, deleted, type Learner, outcomesOf, useAccountService } from '../test/accounts'
import {
  aJpeg,
  photoChanges,
  photoSavedAt as savedAt,
  uploaded,
  wordItem as word
} from '../test/photos'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const { add, drop, onWord, offWord } = photoChanges

const results = accounts.results
const changes = async (learner: Learner) =>
  (await accounts.mutate(learner.token)).changes.filter(change =>
    ['photo', 'photoWord'].includes(change.entity)
  )
const rows = (sql: string) => accounts.running.service.rows(sql)
const fileCount = async (learner: Learner) =>
  (await rows(`select count(*)::int as n from photo_files where user_id = '${learner.userId}'`))[0]
    ?.n
const photoStatus = async (photoId: string) =>
  (await rows(`select status from photos where id = '${photoId}'`))[0]?.status

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

  test("removing a photo's last word empties it: it syncs as a delete and keeps its file, and a word added elsewhere brings it back", async () => {
    const learner = await accounts.learner('photo-last-word@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(learner, add(photoId), onWord(photoId, 1))
    expect(await results(learner, offWord(photoId, 1, 1))).toMatchObject(appliedAt(2))
    expect(await changes(learner)).toEqual(
      expect.arrayContaining([
        deleted('photo', photoId, 2),
        deleted('photoWord', `${photoId}/${word(1)}`, 2)
      ])
    )
    expect(await fileCount(learner)).toBe(1)
    expect(await results(learner, onWord(photoId, 2))).toMatchObject(appliedAt(1))
    expect(await changes(learner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'photo', operation: 'put', version: 3 }),
        expect.objectContaining({ entityId: `${photoId}/${word(2)}`, operation: 'put' })
      ])
    )
  })

  test('a word added elsewhere before the last word goes keeps the photo, whichever order the two arrive in', async () => {
    const learner = await accounts.learner('photo-both-orders@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(learner, add(photoId), onWord(photoId, 1))
    await results(learner, onWord(photoId, 2), offWord(photoId, 1, 1))
    const after = await changes(learner)
    expect(after.find(change => change.entity === 'photo')).toMatchObject({ operation: 'put' })
    expect(
      after.filter(change => change.operation === 'put').map(change => change.entityId)
    ).toEqual([photoId, `${photoId}/${word(2)}`])
  })

  test('a delete wins over words added since, marks them removed, takes the file, and the same photo saved again starts past them', async () => {
    const learner = await accounts.learner('photo-delete@example.com')
    const bytes = aJpeg()
    const photoId = await uploaded(accounts, learner, bytes)
    await results(learner, add(photoId), onWord(photoId, 1), onWord(photoId, 2))
    await results(learner, offWord(photoId, 1, 1), onWord(photoId, 1))
    expect(
      await results(learner, drop(photoId), drop(photoId), drop('d'.repeat(64)))
    ).toMatchObject(appliedAt(2, 2, 0))
    const after = await changes(learner)
    expect(after).toHaveLength(3)
    expect(after).toEqual(
      expect.arrayContaining([
        deleted('photo', photoId, 2),
        deleted('photoWord', `${photoId}/${word(1)}`, 4),
        deleted('photoWord', `${photoId}/${word(2)}`, 2)
      ])
    )
    expect(
      await rows(
        `select count(*)::int as n from photo_words where user_id = '${learner.userId}' and not present`
      )
    ).toEqual([{ n: 2 }])
    expect(await fileCount(learner)).toBe(0)
    expect(outcomesOf(await results(learner, onWord(photoId, 3), add(photoId)))).toEqual([
      'unknown_photo',
      'photo_not_uploaded'
    ])
    await uploaded(accounts, learner, bytes)
    expect(await results(learner, add(photoId), onWord(photoId, 1))).toMatchObject(appliedAt(3, 5))
    expect(await results(learner, offWord(photoId, 1, 3))).toMatchObject([
      { status: 'conflict', version: 5, current: { operation: 'put' } }
    ])
  })

  test("a delete's file leaves storage after the sync, with nothing else to start it", async () => {
    const learner = await accounts.learner('photo-swept@example.com')
    const photoId = await uploaded(accounts, learner)
    const stored = () =>
      [...accounts.running.service.photoStorage.objects.keys()].filter(key =>
        key.startsWith(`${learner.userId}/`)
      )
    await results(learner, add(photoId), onWord(photoId, 1))
    expect(stored()).toHaveLength(1)
    await results(learner, drop(photoId))
    await vi.waitFor(() => expect(stored()).toEqual([]))
  })

  test("the hour's housekeeping empties a photo left with no word for a day, and deletes it and its stored file 30 days on", async () => {
    const learner = await accounts.learner('photo-housekeeping@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(learner, add(photoId))
    const { housekeep, photoStorage } = accounts.running.service
    const stored = () =>
      [...photoStorage.objects.keys()].filter(key => key.startsWith(`${learner.userId}/`))
    await housekeep()
    expect(await photoStatus(photoId)).toBe('shown')
    await rows(`update photos set updated_at = now() - interval '25 hours' where id = '${photoId}'`)
    await housekeep()
    expect(await photoStatus(photoId)).toBe('emptied')
    expect(await changes(learner)).toEqual([deleted('photo', photoId, 2)])
    expect(await fileCount(learner)).toBe(1)
    expect(stored()).toHaveLength(1)
    await rows(`update photos set updated_at = now() - interval '31 days' where id = '${photoId}'`)
    await housekeep()
    expect(await photoStatus(photoId)).toBe('deleted')
    expect(await fileCount(learner)).toBe(0)
    expect(stored()).toEqual([])
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

  phone.change('photo', 'delete', kept)
  await phone.sync()
  await pad.sync()
  expect(pad.dataOf('photoWord', `${kept}/${word(1)}`)).toBeNull()
  expect(pad.state()).toEqual(phone.state())
})
