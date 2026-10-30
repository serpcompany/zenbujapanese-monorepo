import { describe, expect, it, vi } from 'vitest'
import { json, user } from '../../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../../test/copy-stand-in'
import { answeringSync, copyWorld, gated, otherWord, subscribed, word } from '../../test/copy-world'

const other = { id: 'user-2', email: 'other@example.com' }

const theirWord = {
  entity: 'knownWord',
  entityId: otherWord.item,
  operation: 'mark',
  version: 1,
  data: { ...otherWord, itemId: otherWord.item, state: 'known', known: true, stateChangedAt: 'x' }
}

describe("the copy's owner", () => {
  it('keeps the copy and its changes through a sign-out, and sends them when the same account is back', async () => {
    const world = copyWorld()
    await world.signIn()
    await world.signOut()
    await world.change({ change: 'mark', ...word })
    await expect(world.read()).resolves.toMatchObject({
      owner: user.email,
      knownWords: [word],
      unsynced: 1,
      sync: 'signed-out'
    })
    await world.signIn()
    await world.settled()
    expect(world.sent()).toMatchObject([{ entityId: word.item, operation: 'mark' }])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0, sync: 'synced' })
  })

  it("drops the copy when another account signs in, tells pages to ask again, and reads that account's in full", async () => {
    let theirs: (typeof theirWord)[] = []
    const world = copyWorld(answeringSync(body => json(200, syncAnswer(appliedTo(body), theirs))))
    await world.signIn()
    await world.settled()
    await world.signOut()
    await world.change({ change: 'mark', ...word })
    await world.signIn(other)
    expect(world.told.at(-1)).toEqual({ target: 'known', known: null })
    await expect(world.read()).resolves.toMatchObject({
      owner: other.email,
      knownWords: [],
      unsynced: 0
    })
    theirs = [theirWord]
    await world.settled()
    expect((world.syncs().at(-1)?.body as Sync).cursor).toBeNull()
    expect(world.sent()).toEqual([])
    await expect(world.read()).resolves.toMatchObject({ knownWords: [otherWord] })
  })

  it.each([
    [
      'a change',
      (world: ReturnType<typeof copyWorld>) => world.change({ change: 'mark', ...otherWord })
    ],
    ['Sync Now', (world: ReturnType<typeof copyWorld>) => world.settled()]
  ])('takes the copy over for an account kept without its copy, on %s', async (_, first) => {
    const world = copyWorld()
    await world.signIn()
    await world.settled()
    await world.signOut()
    await world.change({ change: 'mark', ...word })
    await world.store.keepSignIn('session-user-2', other)
    await world.store.keepSubscription('session-user-2', subscribed)
    const told = world.told.length
    await first(world)
    expect(world.told.slice(told)).toContainEqual({ target: 'known', known: null })
    await world.change({ change: 'mark', ...otherWord })
    await world.settled()
    expect(world.sent().map(sent => sent.entityId)).toEqual([otherWord.item])
    expect((world.syncs().at(-1)?.body as Sync).cursor).toBe('cursor-1')
    await expect(world.read()).resolves.toMatchObject({
      owner: other.email,
      knownWords: [otherWord],
      unsynced: 0,
      sync: 'synced'
    })
  })

  it("keeps the learner's words when the account is deleted, and forgets only that account's sync", async () => {
    const world = copyWorld(
      answeringSync(body => json(200, syncAnswer(appliedTo(body), [theirWord])))
    )
    await world.signIn()
    await world.settled()
    await world.signOut()
    await world.change({ change: 'mark', ...word })
    const told = world.told.length
    await world.copy.forget()
    expect(world.told).toHaveLength(told)
    expect(world.storage.meta()).toMatchObject({ cursor: null, queue: [], lastSyncedAt: null })
    await expect(world.read()).resolves.toMatchObject({
      knownWords: [otherWord, word],
      unsynced: 0
    })
    await expect(world.ask({ copy: 'known', items: [word.item] })).resolves.toEqual({
      type: 'known',
      known: { [word.item]: true }
    })
  })

  it('applies nothing from an answer that comes back after its account signed out, and sends it again', async () => {
    const { gate, open } = gated()
    const world = copyWorld(
      answeringSync(async body => {
        await gate
        return json(200, syncAnswer(appliedTo(body), world.syncs().length === 1 ? [theirWord] : []))
      })
    )
    await world.markedAndSending()
    await world.signOut()
    open()
    await world.settled()
    await expect(world.read()).resolves.toMatchObject({ knownWords: [word], unsynced: 1 })
    await world.signIn()
    await world.settled()
    const [first, again] = world.sent()
    expect(again?.id).toBe(first?.id)
    await expect(world.read()).resolves.toMatchObject({ knownWords: [word], unsynced: 0 })
  })

  describe('when it syncs', () => {
    it('syncs when a page opens only with changes waiting, or a last sync over 15 minutes ago', async () => {
      const world = copyWorld()
      await world.signIn()
      await world.ask({ copy: 'opened' })
      await vi.waitFor(() => expect(world.syncs()).toHaveLength(1))
      await world.stopped()
      world.later(15 * 60_000)
      await world.ask({ copy: 'opened' })
      await world.copy.chance('startup')
      expect(world.syncs()).toHaveLength(1)
      world.later(1)
      await world.ask({ copy: 'opened' })
      await vi.waitFor(() => expect(world.syncs()).toHaveLength(2))
    })

    it('syncs on startup with changes waiting', async () => {
      const world = copyWorld()
      await world.signIn()
      await world.settled()
      await world.signOut()
      await world.change({ change: 'mark', ...word })
      await world.signIn()
      world.copy.chance('startup')
      await vi.waitFor(() => expect(world.sent()).toHaveLength(1))
    })

    it('syncs after each change, and when access comes back', async () => {
      const world = copyWorld()
      await world.markedAndSending()
      await world.stopped()
      world.copy.chance('access')
      await vi.waitFor(() => expect(world.syncs()).toHaveLength(2))
    })

    it('answers Sync Now with the copy once the sync is done', async () => {
      const world = copyWorld(answeringSync(() => json(200, syncAnswer([], [theirWord]))))
      await world.signIn()
      await expect(world.ask({ copy: 'sync' })).resolves.toMatchObject({
        type: 'copy',
        copy: { knownWords: [otherWord], sync: 'synced' }
      })
    })
  })
})
