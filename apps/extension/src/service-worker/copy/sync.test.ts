import type { SyncedChange } from '@zenbu/account-rules/account-copy'
import { describe, expect, it } from 'vitest'
import { json, refusal } from '../../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../../test/copy-stand-in'
import { answeringSync, copyWorld, gated, otherWord, word } from '../../test/copy-world'

const list = '5a3f2c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b'

const note = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const knownWord = (version: number, known = true, of = word): SyncedChange => ({
  entity: 'knownWord',
  entityId: of.item,
  operation: known ? 'mark' : 'clear',
  version,
  data: {
    itemId: of.item,
    headword: of.headword,
    reading: of.reading,
    state: known ? 'known' : 'unknown',
    known,
    stateChangedAt: '2026-10-29T08:00:00.000Z'
  }
})

const accountList = (version = 1): SyncedChange => ({
  entity: 'list',
  entityId: list,
  operation: 'create',
  version,
  data: { id: list, name: 'N5', position: 1, createdAt: '2026-10-01T00:00:00.000Z' }
})

const listWord = (of = word): SyncedChange => ({
  entity: 'listWord',
  entityId: `${list}/${of.item}`,
  operation: 'add',
  version: 1,
  data: { listId: list, itemId: of.item, headword: of.headword, reading: of.reading, addedAt: 'x' }
})

const accountNote = (version: number, text: string, item = word.item): SyncedChange => ({
  entity: 'wordNote',
  entityId: note,
  operation: 'write',
  version,
  data: { id: note, itemId: item, text, headword: null, reading: null }
})

describe('syncing the copy', () => {
  it("brings the account's words, lists, list words, and notes down, and leaves the rest", async () => {
    const world = copyWorld(
      answeringSync(() =>
        json(
          200,
          syncAnswer(
            [],
            [
              knownWord(2),
              accountList(),
              listWord(),
              accountNote(3, 'Ichidan.'),
              { entity: 'watchedVideo', entityId: 'v', operation: 'watch', version: 1, data: {} },
              { entity: 'profile', entityId: 'me', operation: 'update', version: 1, data: {} },
              {
                entity: 'setting',
                entityId: 'videos.captionPlace',
                operation: 'set',
                version: 1,
                data: { name: 'videos.captionPlace', value: 'top' }
              }
            ]
          )
        )
      )
    )
    await world.signIn()
    await world.settled()
    expect(world.syncs()[0]?.body).toEqual({ cursor: null, limit: 500, mutations: [] })
    await expect(world.read()).resolves.toMatchObject({
      knownWords: [word],
      lists: [{ id: list, name: 'N5', words: [{ ...word, addedAt: 'x' }] }],
      notes: [{ id: note, item: word.item, text: 'Ichidan.' }],
      lastSyncedAt: Date.parse('2026-10-30T09:00:00Z'),
      sync: 'synced'
    })
    expect(world.told).toContainEqual({ target: 'known', known: { [word.item]: true } })
    expect([...world.storage.items.keys()].some(key => key.includes('watchedVideo'))).toBe(false)
    expect(world.settings.items).not.toHaveProperty('videos.captionPlace')
  })

  it('reads on from where the last sync ended', async () => {
    const world = copyWorld()
    await world.signIn()
    await world.settled()
    await world.settled()
    expect(world.syncs().map(asked => (asked.body as Sync).cursor)).toEqual([null, 'cursor-1'])
  })

  it('sends a change made while a sync is on its way next, at the version the account gave', async () => {
    const { gate, open } = gated()
    const world = copyWorld(
      answeringSync(async body => {
        const first = body.mutations[0]?.operation === 'mark'
        if (first) await gate
        return json(200, syncAnswer(appliedTo(body, first ? 4 : 5)))
      })
    )
    await world.markedAndSending()
    await world.change({ change: 'clear', item: word.item })
    open()
    await world.settled()
    expect((world.syncs()[1]?.body as Sync).mutations).toMatchObject([
      { operation: 'clear', baseVersion: 4 }
    ])
    await expect(world.read()).resolves.toMatchObject({ knownWords: [], unsynced: 0 })
  })

  it("keeps the account's value when a change made while the one before it was on its way conflicts too", async () => {
    const { gate, open } = gated()
    const world = copyWorld(
      answeringSync(async body => {
        if (body.mutations[0]?.operation === 'mark') await gate
        const results = body.mutations.map(each =>
          each.baseVersion === 3
            ? { id: each.id, status: 'applied' as const, version: 4 }
            : { id: each.id, status: 'conflict' as const, version: 3, current: knownWord(3) }
        )
        return json(200, syncAnswer(results))
      })
    )
    await world.markedAndSending()
    await world.change({ change: 'clear', item: word.item })
    open()
    await world.settled()
    expect(world.sent().at(-1)).toMatchObject({ operation: 'clear', baseVersion: 0 })
    await expect(world.read()).resolves.toMatchObject({ knownWords: [word], unsynced: 0 })
  })

  it('sends at most fifty changes in one request, and the rest in the next', async () => {
    const world = copyWorld()
    await world.signIn()
    await world.signOut()
    for (let at = 0; at < 60; at += 1) {
      await world.change({ change: 'mark', ...word, item: String(at).padStart(32, '0') })
    }
    await world.signIn()
    await world.settled()
    expect(world.syncs().map(asked => (asked.body as Sync).mutations.length)).toEqual([50, 10])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
  })

  it("takes the account's word when it changed there first", async () => {
    const world = copyWorld(
      answeringSync(body =>
        json(
          200,
          syncAnswer(
            body.mutations.map(sent => ({
              id: sent.id,
              status: 'conflict',
              version: 7,
              current: knownWord(7, false)
            }))
          )
        )
      )
    )
    await world.signIn()
    await world.change({ change: 'mark', ...word })
    await world.settled()
    expect(world.told.at(-1)).toEqual({ target: 'known', known: { [word.item]: false } })
    await expect(world.read()).resolves.toMatchObject({ knownWords: [], unsynced: 0 })
  })

  it('undoes a change the account refused, and keeps the list it did make', async () => {
    const world = copyWorld(
      answeringSync(body =>
        json(
          200,
          syncAnswer(
            body.mutations.map(sent =>
              sent.entity === 'listWord'
                ? {
                    id: sent.id,
                    status: 'rejected',
                    error: { code: 'unknown_list', message: 'No list.' }
                  }
                : { id: sent.id, status: 'applied', version: 1 }
            )
          )
        )
      )
    )
    await world.signIn()
    await world.signOut()
    await world.change({ change: 'create-list', list, name: 'N5', position: 1 })
    await world.change({ change: 'add-word', list, ...word })
    await world.signIn()
    await world.settled()
    await expect(world.read()).resolves.toMatchObject({
      lists: [{ id: list, words: [] }],
      unsynced: 0
    })
  })

  describe('a note changed here and on the account', () => {
    async function noteWorld(current: SyncedChange) {
      let pulled = false
      let conflicted = false
      const world = copyWorld(
        answeringSync(body => {
          if (!pulled) {
            pulled = true
            return json(200, syncAnswer([], [accountNote(2, 'Before.')]))
          }
          const first = !conflicted
          conflicted = true
          return json(
            200,
            syncAnswer(
              body.mutations.map(sent =>
                first
                  ? { id: sent.id, status: 'conflict', version: current.version, current }
                  : { id: sent.id, status: 'applied', version: current.version + 1 }
              )
            )
          )
        })
      )
      await world.signIn()
      await world.settled()
      await world.change({
        change: 'write-note',
        note,
        item: word.item,
        text: 'Mine.',
        headword: null,
        reading: null
      })
      await world.settled()
      return world
    }

    it("keeps both: the account's note, and this one as a new note", async () => {
      const world = await noteWorld(accountNote(3, 'Theirs.'))
      const { notes } = await world.read()
      expect(notes.map(kept => kept.text).sort()).toEqual(['Mine.', 'Theirs.'])
      expect(world.sent().at(-1)).toMatchObject({ operation: 'write', baseVersion: 0 })
      expect(world.sent().at(-1)?.entityId).not.toBe(note)
    })

    it('moves this note onto the word it was moved to there, when only that changed', async () => {
      const world = await noteWorld(accountNote(3, 'Before.', otherWord.item))
      await expect(world.read()).resolves.toMatchObject({
        notes: [{ id: note, item: otherWord.item, text: 'Mine.' }]
      })
      expect(world.sent().at(-1)).toMatchObject({
        entityId: note,
        baseVersion: 3,
        fields: { item: otherWord.item, text: 'Mine.' }
      })
    })
  })

  it("holds a list's words until the list arrives, and drops those whose list never does", async () => {
    let page = 0
    const world = copyWorld(
      answeringSync(() => {
        page += 1
        return page === 1
          ? json(200, syncAnswer([], [listWord(), listWord(otherWord)], 'cursor-1', true))
          : json(200, syncAnswer([], [accountList()], 'cursor-2', false))
      })
    )
    await world.signIn()
    await world.settled()
    const { lists } = await world.read()
    expect(lists.map(kept => kept.words.map(each => each.item))).toEqual([
      [word.item, otherWord.item]
    ])
    expect(world.syncs()).toHaveLength(2)
  })

  it('reads everything again when the account no longer knows where the copy was', async () => {
    let fullReads = 0
    const world = copyWorld(
      answeringSync(body => {
        if (body.cursor === 'cursor-1') return refusal(410, 'invalid_cursor')
        fullReads += 1
        return json(
          200,
          syncAnswer(appliedTo(body), fullReads === 1 ? [accountNote(2, 'Gone.')] : [])
        )
      })
    )
    await world.signIn()
    await world.settled()
    await world.signOut()
    const kept = '9b2f8c1e-0a4d-4c3b-8e7f-6a5b4c3d2e1f'
    await world.change({
      change: 'write-note',
      note: kept,
      item: word.item,
      text: 'Not sent yet.',
      headword: null,
      reading: null
    })
    await world.signIn()
    await world.settled()
    expect(world.syncs().map(asked => (asked.body as Sync).cursor)).toEqual([
      null,
      'cursor-1',
      null
    ])
    await expect(world.read()).resolves.toMatchObject({
      notes: [{ id: kept, text: 'Not sent yet.' }]
    })
  })
})
