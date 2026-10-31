import { describe, expect, it } from 'vitest'
import { knownAtOnce } from '../../shared/account-copy'
import { json } from '../../test/account-stand-in'
import { answeringSync, copyWorld, heldCopy, noLists, otherWord, word } from '../../test/copy-world'

const list = '5a3f2c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b'

const note = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const at = '2026-10-30T09:00:00.000Z'

describe("the copy's changes", () => {
  it('refuses a change while signed out, before any sign-in and after one', async () => {
    const world = copyWorld()
    const signedOut = { type: 'refused', refusal: 'signed-out' }
    await expect(world.change({ change: 'mark', ...word })).resolves.toEqual(signedOut)
    await world.signIn()
    await world.signOut()
    await expect(world.change({ change: 'mark', ...word })).resolves.toEqual(signedOut)
    expect(world.syncs()).toEqual([])
    await expect(world.read()).resolves.toMatchObject({ knownWords: [], unsynced: 0 })
  })

  it.each([
    ['a word ID that is not one', { change: 'mark', ...word, item: 'taberu' }],
    ['a headword with no text', { change: 'mark', ...word, headword: '  ' }],
    ['a kanji ID that is not a kanji', { change: 'clear', item: 'kanji:a' }],
    [
      'a list ID that is not a UUID',
      { change: 'create-list', list: 'mine', name: 'N5', position: 0 }
    ],
    ['a list with no name', { change: 'create-list', list, name: ' ', position: 0 }],
    ['a list placed before the first', { change: 'create-list', list, name: 'N5', position: -1 }],
    ['a rename that changes nothing', { change: 'update-list', list }],
    [
      'a note with no word',
      { change: 'write-note', note, text: 'x', headword: null, reading: null }
    ],
    ['a change it does not know', { change: 'forget', item: word.item }]
  ])('refuses %s', async (_, asked) => {
    const world = await heldCopy()
    await expect(world.ask({ copy: 'change', change: asked as never })).resolves.toEqual({
      type: 'refused',
      refusal: 'invalid'
    })
  })

  it('keeps a word known at once, tells every page, and sends it', async () => {
    const world = copyWorld()
    await world.signIn()
    await expect(world.change({ change: 'mark', ...word })).resolves.toEqual({ type: 'changed' })
    expect((await world.read()).knownWords).toEqual([word])
    expect(world.told).toContainEqual({ target: 'known', known: { [word.item]: true } })
    await world.settled()
    expect(world.sent()).toEqual([
      {
        id: expect.any(String),
        entity: 'knownWord',
        operation: 'mark',
        entityId: word.item,
        baseVersion: 0,
        fields: { headword: '食べる', reading: 'たべる', stateChangedAt: at }
      }
    ])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0, sync: 'synced' })
  })

  it('keeps a kanji known by its kanji ID', async () => {
    const world = await heldCopy()
    await world.change({ change: 'mark', item: 'kanji:食', headword: '食', reading: '' })
    await expect(world.ask({ copy: 'known', items: ['kanji:食', word.item] })).resolves.toEqual({
      type: 'known',
      known: { 'kanji:食': true, [word.item]: false }
    })
  })

  it('keeps only the last of two changes to one word made while neither has gone', async () => {
    const world = await heldCopy()
    await world.change({ change: 'mark', ...word })
    await world.change({ change: 'clear', item: word.item })
    expect(world.told.at(-1)).toEqual({ target: 'known', known: { [word.item]: false } })
    await expect(world.read()).resolves.toMatchObject({ knownWords: [], unsynced: 1 })
  })

  it('tells nobody and keeps nothing to send for a word cleared that was not known', async () => {
    const world = await heldCopy()
    const told = world.told.length
    await world.change({ change: 'clear', item: word.item })
    expect(world.told.slice(told)).toEqual([])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
  })

  it('answers whether words are known for at most a thousand at once', async () => {
    const world = await heldCopy()
    const items = Array.from(
      { length: knownAtOnce + 5 },
      (_, at) => `kanji:${String.fromCodePoint(0x4e00 + at)}`
    )
    const answer = await world.ask({ copy: 'known', items })
    expect(answer.type === 'known' && Object.keys(answer.known)).toHaveLength(knownAtOnce)
  })

  it('makes, renames, and fills a list, folding a rename into a make that has not gone', async () => {
    const world = await heldCopy()
    await world.change({ change: 'create-list', list: list.toUpperCase(), name: 'N5', position: 1 })
    await world.change({ change: 'update-list', list, name: 'N5 verbs' })
    await world.change({ change: 'add-word', list, ...word })
    expect((await world.read()).lists).toEqual([
      {
        id: list,
        name: 'N5 verbs',
        position: 1,
        createdAt: at,
        words: [{ ...word, addedAt: at }]
      }
    ])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 2 })
    await world.settled()
    expect(world.sent().map(sent => [sent.operation, sent.fields])).toEqual([
      ['create', { name: 'N5 verbs', position: 1 }],
      ['add', { headword: '食べる', reading: 'たべる' }]
    ])
  })

  it('refuses a word for a list the copy does not have, and a second list with one ID', async () => {
    const world = await heldCopy()
    await expect(world.change({ change: 'add-word', list, ...word })).resolves.toEqual({
      type: 'refused',
      refusal: 'invalid'
    })
    await world.change({ change: 'create-list', list, name: 'N5', position: 1 })
    await expect(
      world.change({ change: 'create-list', list, name: 'N4', position: 2 })
    ).resolves.toEqual({ type: 'refused', refusal: 'invalid' })
  })

  it('drops a list that never went, with its words, and sends nothing for it', async () => {
    const world = await heldCopy()
    await world.change({ change: 'create-list', list, name: 'N5', position: 1 })
    await world.change({ change: 'add-word', list, ...word })
    await world.change({ change: 'delete-list', list })
    await world.settled()
    expect(world.sent()).toEqual([])
    await expect(world.read()).resolves.toMatchObject({ lists: noLists, unsynced: 0 })
  })

  it("deletes a list the account has, drops its words here, and sends only the list's delete", async () => {
    const world = await heldCopy(
      answeringSync(body =>
        json(200, {
          results: body.mutations.map(sent => ({ id: sent.id, status: 'applied', version: 3 })),
          changes: [],
          cursor: 'c',
          hasMore: false
        })
      )
    )
    await world.change({ change: 'create-list', list, name: 'N5', position: 1 })
    await world.change({ change: 'add-word', list, ...word })
    await world.settled()
    await world.change({ change: 'add-word', list, ...otherWord })
    await world.change({ change: 'delete-list', list })
    await world.settled()
    expect(world.sent().at(-1)).toMatchObject({
      entity: 'list',
      operation: 'delete',
      entityId: list,
      baseVersion: 3
    })
    expect(world.sent().filter(sent => sent.entityId.endsWith(otherWord.item))).toEqual([])
    await expect(world.read()).resolves.toMatchObject({ lists: noLists, unsynced: 0 })
  })

  it('writes and deletes a note, keeping the word it was written on', async () => {
    const world = await heldCopy()
    await world.change({
      change: 'write-note',
      note,
      item: word.item,
      text: 'Ichidan, not godan.',
      headword: '食べる',
      reading: null
    })
    expect((await world.read()).notes).toEqual([
      { id: note, item: word.item, text: 'Ichidan, not godan.', headword: '食べる', reading: null }
    ])
    await world.change({ change: 'delete-note', note })
    await expect(world.read()).resolves.toMatchObject({ notes: [] })
  })
})
