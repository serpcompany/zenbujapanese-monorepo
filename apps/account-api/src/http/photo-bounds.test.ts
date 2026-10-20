import { describe, expect, test } from 'vitest'
import { photoLimits } from '../domain/photo-limits'
import { appliedAt, type Learner, useAccountService } from '../test/accounts'
import {
  aJpeg,
  photoWordFields as fields,
  photoChanges,
  uploaded,
  wordItem as word
} from '../test/photos'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const results = accounts.results
const rows = (sql: string) => accounts.running.service.rows(sql)
const { add, drop, onWord, offWord } = photoChanges

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

const devicesWithPhoto = async (learner: Learner, bytes: Uint8Array, words: number[]) => {
  const photoId = await uploaded(accounts, learner, bytes)
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  phone.change('photo', 'add', photoId, add(photoId).fields)
  for (const n of words) phone.change('photoWord', 'add', `${photoId}/${word(n)}`, fields)
  await phone.sync()
  await pad.sync()
  return { photoId, phone, pad }
}

interface Filler {
  photo: (photoId: string) => string
  from: number
  count: number
}

const removedWhileAway = async (learner: Learner, filler: Filler, thenRemoved: number) => {
  const { photoId, phone, pad } = await devicesWithPhoto(learner, aJpeg(), [1, 2, 3])
  const before = (await accounts.mutate(learner.token)).cursor
  phone.change('photoWord', 'remove', `${photoId}/${word(1)}`)
  await phone.sync()
  await removedWords(learner, filler.photo(photoId), filler.from, filler.count)
  phone.change('photoWord', 'remove', `${photoId}/${word(thenRemoved)}`)
  await phone.sync()
  return { photoId, phone, pad, before }
}

const expectCaughtUp = async (away: Awaited<ReturnType<typeof removedWhileAway>>) => {
  await away.pad.sync()
  expect(away.pad.dataOf('photoWord', `${away.photoId}/${word(1)}`)).toBeNull()
  expect(away.pad.state()).toEqual(away.phone.state())
}

describe('what the account remembers of removed photos and words', () => {
  test('a device away while a photo is deleted and the same image saved again drops the deleted words', async () => {
    const learner = await accounts.learner('photo-away-saved-again@example.com')
    const bytes = aJpeg()
    const { photoId, phone, pad } = await devicesWithPhoto(learner, bytes, [1, 2])
    phone.change('photo', 'delete', photoId)
    await phone.sync()
    await uploaded(accounts, learner, bytes)
    phone.change('photo', 'add', photoId, add(photoId).fields)
    phone.change('photoWord', 'add', `${photoId}/${word(3)}`, fields)
    await phone.sync()
    await pad.sync()
    const fresh = new SyncClient(accounts, learner.token)
    await fresh.sync()
    expect(pad.state()).toEqual(phone.state())
    expect(fresh.state()).toEqual(phone.state())
  })

  test('a device whose cursor is older than a removal the account forgot reads everything again, and drops what the account no longer has', async () => {
    const learner = await accounts.learner('photo-word-forgotten-away@example.com')
    const onTheSamePhoto = {
      photo: (photoId: string) => `'${photoId}'`,
      from: 0x100,
      count: photoLimits.removedWordsPerPhoto - 1
    }
    const away = await removedWhileAway(learner, onTheSamePhoto, 3)
    expect(await journaled(learner, `${away.photoId}/${word(1)}`)).toBe(0)
    expect(await accounts.sync(learner.token, { cursor: away.before })).toMatchObject({
      status: 410,
      body: { error: { code: 'invalid_cursor' } }
    })
    await expectCaughtUp(away)
  })

  test('a device away while a thousand words are removed from other photos still hears of the one removed before them', async () => {
    const learner = await accounts.learner('photo-word-away@example.com')
    const onOtherPhotos = {
      photo: () => 'md5(n::text) || md5(n::text)',
      from: 1,
      count: photoLimits.goneKept
    }
    await expectCaughtUp(await removedWhileAway(learner, onOtherPhotos, 2))
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
    await results(learner, add(forgotten), onWord(forgotten, 1), drop(forgotten))
    await rows(
      `insert into photos (user_id, id, status, version) select '${learner.userId}', md5(n::text) || md5(n::text), 'deleted', 2 from generate_series(1, ${photoLimits.goneKept}) as n`
    )
    const next = await uploaded(accounts, learner)
    await results(learner, add(next))
    expect(await journaled(learner, forgotten)).toBe(0)
    expect(
      await rows(
        `select (select count(*)::int from photos where id = '${forgotten}') as photos, (select count(*)::int from photo_words where photo_id = '${forgotten}') as words`
      )
    ).toEqual([{ photos: 0, words: 0 }])
    await uploaded(accounts, learner, bytes)
    expect(await results(learner, add(forgotten), onWord(forgotten, 1))).toMatchObject(
      appliedAt(3, 3)
    )
  })

  test('a device away while the account forgets a photo deleted with no words is refused once, then drops the photo', async () => {
    const learner = await accounts.learner('photo-forgotten-away@example.com')
    const { photoId, phone, pad } = await devicesWithPhoto(learner, aJpeg(), [])
    phone.change('photo', 'delete', photoId)
    await phone.sync()
    await rows(
      `insert into photos (user_id, id, status, version) select '${learner.userId}', md5(n::text) || md5(n::text), 'deleted', 2 from generate_series(1, ${photoLimits.goneKept}) as n`
    )
    const next = await uploaded(accounts, learner)
    phone.change('photo', 'add', next, add(next).fields)
    await phone.sync()
    expect(await journaled(learner, photoId)).toBe(0)
    await pad.sync()
    expect(pad.local.has(`photo:${photoId}`)).toBe(false)
    expect(pad.state()).toEqual(phone.state())
  })
})
