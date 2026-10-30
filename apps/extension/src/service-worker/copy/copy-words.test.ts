import { describe, expect, it, vi } from 'vitest'
import type { CopyChange } from '../../shared/account-copy'
import { json, refusal, subscription } from '../../test/account-stand-in'
import { appliedTo, syncAnswer } from '../../test/copy-stand-in'
import {
  answeringSync,
  type CopyWorld,
  favorites,
  heldCopy,
  noLists,
  otherWord,
  subscribed,
  word
} from '../../test/copy-world'

const at = '2026-10-30T09:00:00.000Z'

const list = '5a3f2c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b'

const note = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const set = (state: 'learning' | 'known', of = word): CopyChange => ({
  change: 'set',
  ...of,
  state
})

const unknown = (item = word.item): CopyChange => ({ change: 'set', item, state: 'unknown' })

const sentAs = (world: CopyWorld) =>
  world.sent().map(sent => [sent.entity, sent.operation, sent.entityId, sent.fields])

describe("a word's state in the copy", () => {
  it('moves a word through Learning, Known and Unknown, telling pages only when Known changes', async () => {
    const world = await heldCopy()
    await expect(world.change(set('learning'))).resolves.toEqual({ type: 'changed' })
    await expect(world.read()).resolves.toMatchObject({ learningWords: [word], knownWords: [] })
    expect(world.told).not.toContainEqual(expect.objectContaining({ known: { [word.item]: true } }))
    await world.settled()
    await world.change(set('known'))
    await expect(world.read()).resolves.toMatchObject({ learningWords: [], knownWords: [word] })
    expect(world.told.at(-1)).toEqual({ target: 'known', known: { [word.item]: true } })
    await world.settled()
    await world.change(unknown())
    expect(world.told.at(-1)).toEqual({ target: 'known', known: { [word.item]: false } })
    await world.settled()
    expect(sentAs(world)).toEqual([
      [
        'knownWord',
        'set',
        word.item,
        { state: 'learning', headword: '食べる', reading: 'たべる', stateChangedAt: at }
      ],
      [
        'knownWord',
        'set',
        word.item,
        { state: 'known', headword: '食べる', reading: 'たべる', stateChangedAt: at }
      ],
      ['knownWord', 'set', word.item, { state: 'unknown', stateChangedAt: at }]
    ])
    await expect(world.read()).resolves.toMatchObject({ learningWords: [], knownWords: [] })
  })

  it('keeps nothing to send for the state a word already has, or Unknown for a word never kept', async () => {
    const world = await heldCopy()
    await expect(world.change(unknown())).resolves.toEqual({ type: 'changed' })
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
    await world.change(set('learning'))
    await world.change(set('learning'))
    await expect(world.read()).resolves.toMatchObject({ learningWords: [word], unsynced: 1 })
  })

  it('reads Known and Learning newest first', async () => {
    const world = await heldCopy()
    await world.change(set('known'))
    world.later(1_000)
    await world.change(set('known', otherWord))
    await expect(world.read()).resolves.toMatchObject({ knownWords: [otherWord, word] })
  })

  it.each([
    ['Learning with no headword', { change: 'set', ...word, headword: ' ', state: 'learning' }],
    ['a state it does not know', { change: 'set', ...word, state: 'mastered' }]
  ])('refuses %s', async (_, asked) => {
    const world = await heldCopy()
    await expect(world.change(asked as never)).resolves.toEqual({
      type: 'refused',
      refusal: 'invalid'
    })
  })
})

describe("the copy's Favorites and new lists", () => {
  it('shows an empty Favorites first, and makes it with the first word added to it', async () => {
    const world = await heldCopy()
    await expect(world.read()).resolves.toMatchObject({ lists: noLists })
    await world.change({ change: 'add-word', list: favorites, ...word })
    await expect(world.read()).resolves.toMatchObject({
      lists: [
        {
          id: favorites,
          name: 'Favorites',
          position: 0,
          createdAt: at,
          words: [{ ...word, addedAt: at }]
        }
      ]
    })
    await world.settled()
    expect(sentAs(world)).toEqual([
      ['list', 'create', favorites, { name: 'Favorites', position: 0 }],
      ['listWord', 'add', `${favorites}/${word.item}`, { headword: '食べる', reading: 'たべる' }]
    ])
  })

  it('refuses a word for Favorites once the account has deleted it, and shows none', async () => {
    const world = await heldCopy()
    await world.change({ change: 'add-word', list: favorites, ...word })
    await world.settled()
    await world.change({ change: 'delete-list', list: favorites })
    await world.settled()
    await expect(
      world.change({ change: 'add-word', list: favorites, ...otherWord })
    ).resolves.toEqual({ type: 'refused', refusal: 'invalid' })
    await expect(world.read()).resolves.toMatchObject({ lists: [] })
  })

  it('makes a named list after the last with the first word added to it', async () => {
    const world = await heldCopy()
    await world.change({ change: 'create-list', list, name: 'N5', position: 3 })
    const added = '6b4e3d2f-9c8e-4f7a-8b1c-2d3e4f5a6b7c'
    await world.change({ change: 'add-word', list: added, ...word, name: 'Verbs' })
    const { lists } = await world.read()
    expect(lists.map(kept => [kept.name, kept.position, kept.words.length])).toEqual([
      ['Favorites', 0, 0],
      ['N5', 3, 0],
      ['Verbs', 4, 1]
    ])
  })
})

describe("one word's part of the copy", () => {
  async function withNotes() {
    const world = await heldCopy()
    await world.change(set('learning'))
    await world.change({ change: 'create-list', list, name: 'N5', position: 1 })
    await world.change({ change: 'add-word', list, ...word })
    const theirs = '8d0f7780-8536-41ef-a55c-f18ad2fa1b8f'
    for (const [id, of] of [
      [note, word],
      [theirs, otherWord]
    ] as const) {
      await world.change({
        change: 'write-note',
        note: id,
        item: of.item,
        text: of.headword,
        headword: of.headword,
        reading: null
      })
    }
    return { world, theirs }
  }

  it("answers only that word's state, the lists that hold it, and its notes", async () => {
    const { world } = await withNotes()
    await expect(world.ask({ copy: 'word', item: word.item })).resolves.toEqual({
      type: 'word',
      word: {
        state: 'learning',
        lists: [
          { id: favorites, name: 'Favorites', holds: false },
          { id: list, name: 'N5', holds: true }
        ],
        notes: [{ id: note, item: word.item, text: '食べる', headword: '食べる', reading: null }],
        refusal: null
      }
    })
  })

  it.each<[string, (theirs: string) => CopyChange]>([
    ['another word', () => set('known', otherWord)],
    ['a list', () => ({ change: 'create-list', list: favorites, name: 'Favorites', position: 0 })],
    ['adding another word', () => ({ change: 'add-word', list, ...otherWord })],
    [
      "writing over another word's note",
      theirs => ({
        change: 'write-note',
        note: theirs,
        item: word.item,
        text: 'x',
        headword: null,
        reading: null
      })
    ],
    ["deleting another word's note", theirs => ({ change: 'delete-note', note: theirs })]
  ])('refuses a change about %s', async (_, asked) => {
    const { world, theirs } = await withNotes()
    const change = asked(theirs)
    const before = await world.read()
    await expect(world.ask({ copy: 'word-change', item: word.item, change })).resolves.toEqual({
      type: 'refused',
      refusal: 'invalid'
    })
    await expect(world.read()).resolves.toEqual(before)
  })

  it('takes a change about that word', async () => {
    const { world } = await withNotes()
    await expect(
      world.ask({ copy: 'word-change', item: word.item, change: { change: 'delete-note', note } })
    ).resolves.toEqual({ type: 'changed' })
    await expect(
      world.ask({ copy: 'word-change', item: word.item, change: set('known') })
    ).resolves.toEqual({ type: 'changed' })
    await expect(world.ask({ copy: 'word', item: word.item })).resolves.toMatchObject({
      word: { state: 'known', notes: [] }
    })
  })
})

describe('saving refused by the service worker', () => {
  it('refuses a change while the account needs a subscription, and keeps nothing', async () => {
    const world = await heldCopy()
    await world.store.keepSubscription('session-user-1', subscription)
    await expect(world.change(set('known'))).resolves.toEqual({
      type: 'refused',
      refusal: 'subscription-required'
    })
    await expect(world.read()).resolves.toMatchObject({ knownWords: [], unsynced: 0 })
    await expect(world.ask({ copy: 'word', item: word.item })).resolves.toMatchObject({
      word: { refusal: 'subscription-required' }
    })
  })

  it('tells the page that made a change once when the account turns out to need a subscription', async () => {
    let paywalled = false
    const world = await heldCopy(
      answeringSync(body =>
        paywalled ? refusal(402, 'subscription_required') : json(200, syncAnswer(appliedTo(body)))
      ),
      { 'GET /v1/me/subscription': () => json(200, paywalled ? subscription : subscribed) }
    )
    world.later(2_000)
    paywalled = true
    const told = vi.fn()
    await world.copy.answer({ copy: 'change', change: set('known') }, told)
    await vi.waitFor(() => expect(told).toHaveBeenCalledWith('subscription-required'))
    await expect(world.change(set('learning', otherWord))).resolves.toEqual({
      type: 'refused',
      refusal: 'subscription-required'
    })
    expect(told).toHaveBeenCalledTimes(1)
  })
})
