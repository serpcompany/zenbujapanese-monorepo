import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, test } from 'vitest'
import { purgeExpired } from '../db/housekeeping'
import { type Learner, outcomesOf, useAccountService } from '../test/accounts'
import { aJpeg, photoIdOf, uploaded } from '../test/photos'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const set = (photoId: string, baseVersion: number, entityId?: string) => ({
  entity: 'profilePhoto',
  operation: 'set',
  ...(entityId ? { entityId } : {}),
  baseVersion,
  fields: { photoId }
})
const remove = (baseVersion: number) => ({
  entity: 'profilePhoto',
  operation: 'remove',
  baseVersion
})

const results = accounts.results
const changesOf = (learner: Learner) => accounts.changesOf(learner, 'profilePhoto')
const rows = (sql: string) => accounts.running.service.rows(sql)
const filesOf = async (learner: Learner) =>
  (await rows(`select id from photo_files where user_id = '${learner.userId}' order by id`)).map(
    row => row.id
  )

describe('the profile photo', () => {
  test('a set at the version seen applies, a stale one conflicts, and the file it replaces goes', async () => {
    const learner = await accounts.learner('profile-photo@example.com')
    const [first, second, third] = [
      await uploaded(accounts, learner),
      await uploaded(accounts, learner),
      await uploaded(accounts, learner)
    ]
    expect(
      await results(learner, set(first, 0, learner.userId), set(first, 0), set(second, 0))
    ).toMatchObject([
      { status: 'applied', version: 1 },
      { status: 'applied', version: 1 },
      { status: 'conflict', version: 1, current: { operation: 'put', data: { photoId: first } } }
    ])
    expect(await results(learner, set(second, 1))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'profilePhoto',
        entityId: learner.userId,
        operation: 'put',
        version: 2,
        data: { photoId: second }
      }
    ])
    expect(await filesOf(learner)).toEqual([second, third].sort())
  })

  test('a remove at the version seen applies and syncs as a delete; one that never saw a newer photo conflicts', async () => {
    const learner = await accounts.learner('profile-photo-remove@example.com')
    const [first, second] = [await uploaded(accounts, learner), await uploaded(accounts, learner)]
    await results(learner, set(first, 0), set(second, 1))
    expect(await results(learner, remove(1), remove(2), remove(3))).toMatchObject([
      { status: 'conflict', version: 2, current: { data: { photoId: second } } },
      { status: 'applied', version: 3 },
      { status: 'applied', version: 3 }
    ])
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'profilePhoto',
        entityId: learner.userId,
        operation: 'delete',
        version: 3,
        data: null
      }
    ])
    expect(await filesOf(learner)).toEqual([])
  })

  test('shares a file with a Media Library photo, which keeps it while either names it', async () => {
    const learner = await accounts.learner('profile-photo-shared@example.com')
    const photoId = await uploaded(accounts, learner)
    await results(
      learner,
      set(photoId, 0),
      {
        entity: 'photo',
        operation: 'add',
        entityId: photoId,
        fields: { name: 'Me.jpg', savedAt: '2026-10-01T12:00:00Z' }
      },
      { entity: 'photo', operation: 'delete', entityId: photoId }
    )
    expect(await filesOf(learner)).toEqual([photoId])
    await results(learner, remove(1))
    expect(await filesOf(learner)).toEqual([])
  })

  test('refuses a photo the account has not, bad fields, another account, and no baseVersion', async () => {
    const learner = await accounts.learner('profile-photo-refused@example.com')
    const answer = await results(
      learner,
      set('a'.repeat(64), 0),
      { ...set('ABC', 0) },
      { ...set('a'.repeat(64), 0), fields: { photoId: 'a'.repeat(64), crop: 1 } },
      set('a'.repeat(64), 0, 'someone-else'),
      { ...remove(0), baseVersion: undefined }
    )
    expect(answer.map(result => result.error?.code)).toEqual([
      'photo_not_uploaded',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation',
      'invalid_mutation'
    ])
  })

  test('an app with only `profile` reads the profile photo, and no other file', async () => {
    const email = 'profile-photo-web@example.com'
    const zenbu = await accounts.learner(email)
    const [profile, library] = [await uploaded(accounts, zenbu), await uploaded(accounts, zenbu)]
    await results(zenbu, set(profile, 0))
    const web = await accounts.learner(email, 'zenbu-web')
    const send = accounts.running.service.sendPhoto
    expect((await send(web.token, profile, new Uint8Array(), 'GET')).status).toBe(200)
    expect((await send(web.token, library, new Uint8Array(), 'GET')).status).toBe(404)
  })

  test('an app with only `profile` never sets a Media Library photo as the profile photo, nor learns the library', async () => {
    const email = 'profile-photo-only@example.com'
    const zenbu = await accounts.learner(email)
    const bytes = aJpeg()
    const library = await uploaded(accounts, zenbu, bytes)
    await results(zenbu, {
      entity: 'photo',
      operation: 'add',
      entityId: library,
      fields: { name: 'Menu.jpg', savedAt: '2026-10-01T12:00:00Z' }
    })
    const web = await accounts.learner(email, 'zenbu-web')
    const again = await accounts.running.service.sendPhoto(web.token, library, bytes)
    expect(again.status).toBe(201)
    expect(outcomesOf(await results(web, set(library, 0)))).toEqual(['photo_not_uploaded'])
    expect(outcomesOf(await results(zenbu, set(library, 0)))).toEqual(['applied'])
  })

  test('an app with only `profile` holds two files outside the Media Library at most', async () => {
    const email = 'profile-photo-files@example.com'
    await accounts.learner(email)
    const web = await accounts.learner(email, 'zenbu-web')
    const send = (bytes: Uint8Array) =>
      accounts.running.service.sendPhoto(web.token, photoIdOf(bytes), bytes)
    expect([(await send(aJpeg())).status, (await send(aJpeg())).status]).toEqual([201, 201])
    expect((await send(aJpeg())).status).toBe(409)
  })
})

test('a file no photo names a day after its upload is deleted', async () => {
  const learner = await accounts.learner('photo-unnamed@example.com')
  const [old, fresh, named] = [
    await uploaded(accounts, learner),
    await uploaded(accounts, learner),
    await uploaded(accounts, learner)
  ]
  await results(learner, set(named, 0))
  await accounts.running.service.files.sweep()
  await rows(
    `update photo_files set uploaded_at = now() - interval '25 hours' where id in ('${old}', '${named}')`
  )
  await purgeExpired(drizzle(accounts.running.service.client))
  expect(await filesOf(learner)).toEqual([fresh, named].sort())
  expect(
    await rows('select count(*)::int as n from photo_file_deletions where due_at <= now()')
  ).toEqual([{ n: 1 }])
  await accounts.running.service.files.sweep()
  expect(
    await rows('select count(*)::int as n from photo_file_deletions where due_at <= now()')
  ).toEqual([{ n: 0 }])
})

test('two devices converge on the profile photo: the first change to sync wins', async () => {
  const learner = await accounts.learner('profile-photo-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const mac = new SyncClient(accounts, learner.token)
  const [first, phones, macs] = [
    await uploaded(accounts, learner),
    await uploaded(accounts, learner),
    await uploaded(accounts, learner)
  ]
  phone.change('profilePhoto', 'set', learner.userId, { photoId: first })
  await phone.sync()
  await mac.sync()
  mac.change('profilePhoto', 'set', learner.userId, { photoId: macs })
  phone.change('profilePhoto', 'set', learner.userId, { photoId: phones })
  await mac.sync()
  await phone.sync()
  await mac.sync()
  expect(phone.state()).toEqual(mac.state())
  expect(phone.dataOf('profilePhoto', learner.userId)).toEqual({ photoId: macs })
})
