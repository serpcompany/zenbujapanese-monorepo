import { describe, expect, test } from 'vitest'
import { photoLimits } from '../domain/photo-limits'
import { appliedAt, type Learner, useAccountService } from '../test/accounts'
import { uploaded } from '../test/photos'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const word = (n: number) => n.toString(16).padStart(32, '0')
const savedAt = '2026-10-01T12:00:00.000Z'
const fields = { headword: '見る', reading: 'みる', savedAt }
const results = accounts.results
const rows = (sql: string) => accounts.running.service.rows(sql)

const add = (photoId: string) => ({
  entity: 'photo',
  operation: 'add',
  entityId: photoId,
  fields: { name: 'Menu.jpg', savedAt }
})
const drop = (photoId: string) => ({ entity: 'photo', operation: 'delete', entityId: photoId })
const onWord = (photoId: string, n: number) => ({
  entity: 'photoWord',
  operation: 'add',
  entityId: `${photoId}/${word(n)}`,
  fields
})
const offWord = (photoId: string, n: number, baseVersion: number) => ({
  entity: 'photoWord',
  operation: 'remove',
  entityId: `${photoId}/${word(n)}`,
  baseVersion
})

const removedWords = (learner: Learner, photoId: string, from: number, count: number) =>
  rows(
    `insert into photo_words (user_id, photo_id, item_id, headword, reading, saved_at, present, version) select '${learner.userId}', ${photoId}, lpad(to_hex(n), 32, '0'), 'x', '', now(), false, 2 from generate_series(${from}, ${from + count - 1}) as n`
  )
const journaled = async (learner: Learner, entityId: string) =>
  (
    await rows(
      `select count(*)::int as n from sync_changes where user_id = '${learner.userId}' and entity_id = '${entityId}'`
    )
  )[0]?.n

describe('what the account remembers of removed photos and words', () => {
  test('a device away while a thousand words are removed from other photos still hears of the one removed before them', async () => {
    const learner = await accounts.learner('photo-word-away@example.com')
    const photoId = await uploaded(accounts, learner)
    const phone = new SyncClient(accounts, learner.token)
    const pad = new SyncClient(accounts, learner.token)
    phone.change('photo', 'add', photoId, add(photoId).fields)
    for (const n of [1, 2, 3]) phone.change('photoWord', 'add', `${photoId}/${word(n)}`, fields)
    await phone.sync()
    await pad.sync()
    phone.change('photoWord', 'remove', `${photoId}/${word(1)}`)
    await phone.sync()
    await removedWords(learner, 'md5(n::text) || md5(n::text)', 1, photoLimits.goneKept)
    phone.change('photoWord', 'remove', `${photoId}/${word(2)}`)
    await phone.sync()
    await pad.sync()
    expect(pad.dataOf('photoWord', `${photoId}/${word(1)}`)).toBeNull()
    expect(pad.state()).toEqual(phone.state())
  })

  test('a photo remembers its latest removed words, and a word it forgot comes back past every version it had', async () => {
    const learner = await accounts.learner('photo-word-bound@example.com')
    const [photoId, other] = [await uploaded(accounts, learner), await uploaded(accounts, learner)]
    await results(learner, add(other), onWord(other, 1), onWord(other, 2))
    await results(learner, offWord(other, 1, 1))
    await results(learner, add(photoId), onWord(photoId, 1), onWord(photoId, 2), onWord(photoId, 3))
    await results(learner, offWord(photoId, 1, 1))
    await removedWords(learner, `'${photoId}'`, 0x100, photoLimits.removedWordsPerPhoto - 1)
    await results(learner, offWord(photoId, 3, 1))
    expect(await journaled(learner, `${photoId}/${word(1)}`)).toBe(0)
    expect(
      await rows(
        `select photo_id = '${photoId}' as here, count(*)::int as n from photo_words where user_id = '${learner.userId}' and not present group by 1 order by 1`
      )
    ).toEqual([
      { here: false, n: 1 },
      { here: true, n: photoLimits.removedWordsPerPhoto }
    ])
    expect(await results(learner, onWord(photoId, 1))).toMatchObject(appliedAt(3))
    expect(await results(learner, offWord(photoId, 1, 1))).toMatchObject([
      { status: 'conflict', version: 3 }
    ])
  })

  test('an account remembers its latest 1,000 deleted photos, and one it forgot comes back past every version it had', async () => {
    const learner = await accounts.learner('photo-bound@example.com')
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7])
    const forgotten = await uploaded(accounts, learner, bytes)
    await results(learner, add(forgotten), drop(forgotten))
    await rows(
      `insert into photos (user_id, id, status, version) select '${learner.userId}', md5(n::text) || md5(n::text), 'deleted', 2 from generate_series(1, ${photoLimits.goneKept}) as n`
    )
    const next = await uploaded(accounts, learner)
    await results(learner, add(next))
    expect(await journaled(learner, forgotten)).toBe(0)
    expect(await rows(`select count(*)::int as n from photos where id = '${forgotten}'`)).toEqual([
      { n: 0 }
    ])
    await uploaded(accounts, learner, bytes)
    expect(await results(learner, add(forgotten))).toMatchObject(appliedAt(3))
  })
})
