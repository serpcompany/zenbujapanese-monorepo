import { describe, expect, test } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const video = (n: number) => `video${String(n).padStart(6, '0')}`
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12) + minutes * 60_000).toISOString()

const watch = (videoId: string, baseVersion: number, fields: Record<string, unknown>) => ({
  entity: 'watchedVideo',
  operation: 'watch',
  entityId: videoId,
  baseVersion,
  fields
})
const remove = (videoId: string) => ({
  entity: 'watchedVideo',
  operation: 'remove',
  entityId: videoId
})

async function results(learner: Learner, ...mutations: Record<string, unknown>[]) {
  return (await accounts.mutate(learner.token, ...mutations)).results
}

async function changesOf(learner: Learner) {
  return (await accounts.mutate(learner.token)).changes.filter(
    change => change.entity === 'watchedVideo'
  )
}

const rows = (sql: string) => accounts.running.service.rows(sql)

describe('watched videos', () => {
  test('a watch puts the video in the account, and fields it leaves out keep theirs', async () => {
    const learner = await accounts.learner('watch-put@example.com')
    const details = { title: ' ラーメンの作り方 ', author: 'Chef', duration: 600 }
    expect(await results(learner, watch(video(1), 0, { watchedAt: at(0), ...details }))).toEqual([
      expect.objectContaining({ status: 'applied', version: 1 })
    ])
    const later = { watchedAt: at(5), position: 120.5, comprehension: 0.42 }
    expect(await results(learner, watch(video(1), 1, later))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await results(learner, watch(video(1), 2, later))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'watchedVideo',
        entityId: video(1),
        operation: 'put',
        version: 2,
        data: {
          videoId: video(1),
          title: 'ラーメンの作り方',
          author: 'Chef',
          duration: 600,
          position: 120.5,
          comprehension: 0.42,
          watchedAt: at(5)
        }
      }
    ])
  })

  test('a watch at any version applies: the latest watch sets the place, and an older one sent late only fills in', async () => {
    const learner = await accounts.learner('watch-latest@example.com')
    await results(learner, watch(video(2), 0, { watchedAt: at(10), position: 100 }))
    expect(
      await results(learner, watch(video(2), 0, { watchedAt: at(20), position: 200 }))
    ).toMatchObject([{ status: 'applied', version: 2 }])
    expect(
      await results(learner, watch(video(2), 0, { watchedAt: at(5), position: 50, title: 'Late' }))
    ).toMatchObject([{ status: 'applied', version: 3 }])
    expect((await changesOf(learner))[0]?.data).toMatchObject({
      position: 200,
      title: 'Late',
      watchedAt: at(20)
    })
    const before = Date.now()
    await results(learner, watch(video(3), 0, { watchedAt: '2100-01-01T00:00:00Z' }))
    const taken = (await changesOf(learner)).find(change => change.entityId === video(3))
    const watchedAt = Date.parse(String(taken?.data?.watchedAt))
    expect(watchedAt).toBeGreaterThanOrEqual(before - 1000)
    expect(watchedAt).toBeLessThanOrEqual(Date.now())
  })

  test('a removal always applies; a watch made before seeing it loses, and one made after brings the video back', async () => {
    const learner = await accounts.learner('watch-remove@example.com')
    await results(learner, watch(video(4), 0, { watchedAt: at(0), title: 'Gone soon' }))
    await results(learner, watch(video(4), 1, { watchedAt: at(1), position: 30 }))
    expect(await results(learner, remove(video(4)))).toMatchObject([
      { status: 'applied', version: 3 }
    ])
    expect(await changesOf(learner)).toEqual([
      { entity: 'watchedVideo', entityId: video(4), operation: 'delete', version: 3, data: null }
    ])
    expect(
      await rows(
        `select title, position, watched_at, status from watched_videos where user_id = '${learner.userId}' and video_id = '${video(4)}'`
      )
    ).toEqual([{ title: null, position: null, watched_at: null, status: 'removed' }])
    expect(
      await results(learner, watch(video(4), 2, { watchedAt: at(2), position: 60 }))
    ).toMatchObject([
      { status: 'conflict', version: 3, current: { operation: 'delete', data: null } }
    ])
    expect(await results(learner, watch(video(4), 3, { watchedAt: at(3) }))).toMatchObject([
      { status: 'applied', version: 4 }
    ])
    expect((await changesOf(learner))[0]).toMatchObject({ operation: 'put', version: 4 })
    expect(await results(learner, remove(video(99)))).toMatchObject([
      { status: 'applied', version: 0 }
    ])
  })

  test('keeps the 50 most recently watched: a newer one prunes the oldest, as a delete, which a removal there makes stick', async () => {
    const learner = await accounts.learner('watch-cap@example.com')
    const fifty = Array.from({ length: 50 }, (_, n) =>
      watch(video(n + 1), 0, { watchedAt: at(n + 1) })
    )
    expect((await results(learner, ...fifty)).every(result => result.status === 'applied')).toBe(
      true
    )
    const { cursor } = await accounts.mutate(learner.token)
    expect(await results(learner, watch(video(51), 0, { watchedAt: at(60) }))).toMatchObject([
      { status: 'applied', version: 1 }
    ])
    const next = (await accounts.sync(learner.token, { cursor })).body as unknown as {
      changes: { entityId: string; operation: string }[]
    }
    expect(next.changes.map(change => [change.entityId, change.operation]).sort()).toEqual([
      [video(1), 'delete'],
      [video(51), 'put']
    ])
    expect(await results(learner, watch(video(1), 1, { watchedAt: at(70) }))).toMatchObject([
      { status: 'applied', version: 3 }
    ])
    expect(await results(learner, remove(video(2)))).toMatchObject([
      { status: 'applied', version: 3 }
    ])
    expect(await results(learner, watch(video(2), 1, { watchedAt: at(80) }))).toMatchObject([
      { status: 'conflict', version: 3 }
    ])
    const live = await rows(
      `select video_id from watched_videos w join users u on u.id = w.user_id where u.email = 'watch-cap@example.com' and status = 'watched' order by watched_at`
    )
    expect(live).toHaveLength(50)
    expect(live[0]).toEqual({ video_id: video(3) })
    expect(live.at(-1)).toEqual({ video_id: video(1) })
  })

  test('forgets all but the latest 100 removals, so its journal stays bounded', async () => {
    const learner = await accounts.learner('watch-forget@example.com')
    await rows(
      `insert into watched_videos (user_id, video_id, status, version) select '${learner.userId}', 'gone' || lpad(n::text, 7, '0'), 'removed', 2 from generate_series(1, 120) as n`
    )
    await rows(
      `insert into sync_changes (user_id, entity_type, entity_id, entity_version, operation) select '${learner.userId}', 'watchedVideo', 'gone' || lpad(n::text, 7, '0'), 2, 'remove' from generate_series(1, 120) as n`
    )
    await results(learner, watch(video(5), 0, { watchedAt: at(0) }), remove(video(5)))
    const kept = await rows(
      `select video_id from watched_videos where user_id = '${learner.userId}' order by video_id`
    )
    expect(kept).toHaveLength(100)
    expect(kept[0]).toEqual({ video_id: 'gone0000022' })
    expect(kept.at(-1)).toEqual({ video_id: video(5) })
    const journal = await rows(
      `select count(*)::int as n from sync_changes where user_id = '${learner.userId}' and entity_type = 'watchedVideo'`
    )
    expect(journal).toEqual([{ n: 100 }])
  })

  test('refuses a bad video ID or fields, cuts a long title, and keeps the title a blank one would replace', async () => {
    const learner = await accounts.learner('watch-bad@example.com')
    const answer = await results(
      learner,
      watch('too-short', 0, { watchedAt: at(0) }),
      watch(video(6), 0, {}),
      watch(video(6), 0, { watchedAt: 'yesterday' }),
      watch(video(6), 0, { watchedAt: '0000-01-01T00:00:00Z' }),
      watch(video(6), 0, { watchedAt: '1999-12-31T23:59:59Z' }),
      watch(video(6), 0, { watchedAt: at(0), position: -1 }),
      watch(video(6), 0, { watchedAt: at(0), comprehension: 1.5 }),
      watch(video(6), 0, { watchedAt: at(0), title: 7 }),
      watch(video(6), 0, { watchedAt: at(0), channel: 'x' }),
      { ...watch(video(6), 0, { watchedAt: at(0) }), baseVersion: undefined }
    )
    expect(answer.map(result => result.error?.code)).toEqual([
      'invalid_mutation',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation'
    ])
    await results(learner, watch(video(7), 0, { watchedAt: at(0), title: `${'長'.repeat(250)}` }))
    await results(learner, watch(video(7), 1, { watchedAt: at(1), title: ' \t ', author: 'A\nB' }))
    const [stored] = await rows(
      `select title, author from watched_videos where user_id = '${learner.userId}' and video_id = '${video(7)}'`
    )
    expect(stored).toEqual({ title: '長'.repeat(200), author: 'A B' })
  })

  test('a conflict sent again under its ID answers the same', async () => {
    const learner = await accounts.learner('watch-replay@example.com')
    await results(learner, watch(video(8), 0, { watchedAt: at(0) }), remove(video(8)))
    const stale = { id: 'stale-watch-01', ...watch(video(8), 1, { watchedAt: at(1) }) }
    const first = await accounts.sync(learner.token, { mutations: [stale] })
    const again = await accounts.sync(learner.token, { mutations: [stale] })
    expect(again.body?.results).toEqual(first.body?.results)
    expect(first.body?.results).toMatchObject([{ status: 'conflict', version: 2 }])
  })
})

test('two devices converge on watch history through new places, removals, and the newest 50', async () => {
  const learner = await accounts.learner('watch-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const mac = new SyncClient(accounts, learner.token)
  phone.change('watchedVideo', 'watch', video(1), { watchedAt: at(1), title: 'One' })
  phone.change('watchedVideo', 'watch', video(2), { watchedAt: at(2), title: 'Two' })
  await phone.sync()
  await mac.sync()

  phone.change('watchedVideo', 'watch', video(1), { watchedAt: at(90), title: 'One', position: 90 })
  phone.change('watchedVideo', 'watch', video(2), { watchedAt: at(90), title: 'Two', position: 10 })
  mac.change('watchedVideo', 'remove', video(2))
  await mac.sync()
  for (let n = 10; n < 60; n++) {
    mac.change('watchedVideo', 'watch', video(n), { watchedAt: at(n) })
  }
  await mac.sync()
  await phone.sync()
  await mac.sync()

  expect(phone.state()).toEqual(mac.state())
  expect(phone.dataOf('watchedVideo', video(1))).toMatchObject({ position: 90, title: 'One' })
  expect(phone.dataOf('watchedVideo', video(2))).toBeNull()
  expect(phone.dataOf('watchedVideo', video(10))).toBeNull()
  expect([...phone.state().keys()].filter(key => key.startsWith('watchedVideo:'))).toHaveLength(50)
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
