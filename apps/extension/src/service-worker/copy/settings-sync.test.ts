import type { MutationResult, SyncedChange } from '@zenbu/account-rules/account-copy'
import { describe, expect, it } from 'vitest'
import { chosenWith, moved } from '../../settings/frequency-order'
import { readSettings, settingDefaults } from '../../shared/settings'
import { json } from '../../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../../test/copy-stand-in'
import { answeringSync, copyWorld } from '../../test/copy-world'

const setting = (name: string, value: unknown, version = 1): SyncedChange => ({
  entity: 'setting',
  entityId: name,
  operation: 'set',
  version,
  data: { name, value }
})

const [first, second] = settingDefaults['frequencyDictionaries.chosen']

const third = 'zenbu.wikipedia.written.ja'

const answering = (
  answer: (body: Sync, request: number) => { results?: MutationResult[]; changes?: SyncedChange[] }
) => {
  let request = 0
  return answeringSync(body => {
    request += 1
    const { results = appliedTo(body), changes = [] } = answer(body, request)
    return json(200, syncAnswer(results, changes))
  })
}

const settingsSent = (world: ReturnType<typeof copyWorld>) =>
  world.sent().filter(sent => sent.entity === 'setting')

describe("the copy's settings", () => {
  it("sends the browser's settings changed from their defaults at version 0, and no others", async () => {
    const world = copyWorld(undefined, {
      'readingAids.romaji': true,
      'readingAids.furigana': true,
      'sites.off': ['example.com'],
      'videos.zenbuCaptions': false,
      'videos.captionPlace': { x: 0.5, y: 0.2 }
    })
    await world.signIn()
    await world.settled()
    expect(world.sent()).toEqual([
      {
        id: expect.any(String),
        entity: 'setting',
        operation: 'set',
        entityId: 'readingAids.romaji',
        baseVersion: 0,
        fields: { value: true }
      }
    ])
  })

  it("takes the account's settings over the browser's, and writes them to the browser", async () => {
    const world = copyWorld(
      answering((body, request) =>
        request === 1
          ? {
              results: body.mutations.map(sent => ({
                id: sent.id,
                status: 'conflict',
                version: 2,
                current: setting('readingAids.romaji', false, 2)
              })),
              changes: [
                setting('readingAids.romaji', false, 2),
                setting('readingAids.furigana', false, 3)
              ]
            }
          : {}
      ),
      { 'readingAids.romaji': true }
    )
    await world.signIn()
    await world.settled()
    expect(world.settings.items).toMatchObject({
      'readingAids.romaji': false,
      'readingAids.furigana': false
    })
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world)).toHaveLength(1)
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
  })

  it("sends nothing over the account's setting when the browser couldn't write it, and writes it next time", async () => {
    const world = copyWorld(
      answering((_, request) => ({
        changes: request <= 2 ? [setting('readingAids.romaji', true, 2)] : []
      }))
    )
    world.settings.failWrites(1)
    await world.signIn()
    await world.settled()
    expect(world.failures).toEqual(['account-copy'])
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world)).toEqual([])
    expect(world.settings.items).toMatchObject({ 'readingAids.romaji': true })
  })

  it('brings the translation language and source down, and never sends either', async () => {
    const world = copyWorld(
      answering(() => ({
        changes: [
          setting('readingAids.translationLanguage', 'ja'),
          setting('readingAids.translationSource', 'apple')
        ]
      }))
    )
    await world.signIn()
    await world.settled()
    await expect(world.read()).resolves.toMatchObject({
      accountSettings: {
        'readingAids.translationLanguage': 'ja',
        'readingAids.translationSource': 'apple'
      }
    })
    expect(world.settings.items).not.toHaveProperty('readingAids.translationSource')
    expect(world.sent().map(sent => sent.entityId)).not.toContain('readingAids.translationSource')
  })

  it('sends the chosen frequency dictionaries joined by commas, and brings them back in order', async () => {
    const world = copyWorld(
      answering((_, request) => ({
        changes: request === 2 ? [setting('frequencyDictionaries.chosen', `${third}`, 2)] : []
      })),
      {
        'frequencyDictionaries.chosen': [second, first],
        'frequencyDictionaries.order': [second, first, third]
      }
    )
    await world.signIn()
    await world.settled()
    expect(settingsSent(world)[0]?.fields).toEqual({ value: `${second},${first}` })
    await world.settled()
    expect(world.settings.items).toMatchObject({
      'frequencyDictionaries.chosen': [third],
      'frequencyDictionaries.order': [third, second, first]
    })
  })

  it("keeps the account's frequency dictionaries this browser doesn't have through a toggle and a reorder here", async () => {
    const jiten = 'zenbu.jiten.anime.ja.ordered-v2'
    const wikipedia = 'zenbu.wikipedia.written.ja.unidic-3.1'
    const world = copyWorld(
      answering((_, request) => ({
        changes:
          request === 1
            ? [setting('frequencyDictionaries.chosen', `${first},${jiten},${wikipedia}`, 7)]
            : []
      }))
    )
    await world.signIn()
    await world.settled()
    const edit = async (change: typeof chosenWith) => {
      const settings = await readSettings(world.settings.store)
      await world.settings.store.set(change(settings, second, true))
      await world.copy.settingsChanged()
      await world.settled()
    }
    await edit(chosenWith)
    await edit(settings => moved(settings, second, -1))
    expect(settingsSent(world).map(sent => sent.fields?.value)).toEqual([
      `${first},${jiten},${wikipedia},${second}`,
      `${second},${jiten},${wikipedia},${first}`
    ])
  })

  it("sends a setting changed in the browser later at the account's version", async () => {
    const world = copyWorld(
      answering((_, request) => ({
        changes: request === 1 ? [setting('readingAids.furigana', true, 3)] : []
      }))
    )
    await world.signIn()
    await world.settled()
    await world.settings.store.set({ 'readingAids.furigana': false })
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world)).toMatchObject([
      { entityId: 'readingAids.furigana', baseVersion: 3, fields: { value: false } }
    ])
  })

  it('does not send a setting the account refused again until it changes in the browser', async () => {
    const world = copyWorld(
      answering((body, request) => ({
        results:
          request === 1
            ? body.mutations.map(sent => ({
                id: sent.id,
                status: 'rejected',
                error: { code: 'invalid_setting', message: 'No.' }
              }))
            : appliedTo(body)
      })),
      { 'readingAids.romaji': true }
    )
    await world.signIn()
    await world.settled()
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world)).toHaveLength(1)
    await world.settings.store.set({ 'readingAids.romaji': false })
    await world.settings.store.set({ 'readingAids.romaji': true })
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world)).toHaveLength(1)
    await world.settings.store.set({ 'readingAids.translations': false })
    await world.copy.settingsChanged()
    await world.settled()
    expect(settingsSent(world).map(sent => sent.entityId)).toEqual([
      'readingAids.romaji',
      'readingAids.translations'
    ])
  })

  it('sends a setting again at version 0 when the account no longer holds it', async () => {
    const world = copyWorld(
      answering((body, request) => ({
        results:
          request === 1
            ? body.mutations.map(sent => ({
                id: sent.id,
                status: 'conflict',
                version: 0,
                current: {
                  entity: 'setting',
                  entityId: sent.entityId,
                  operation: 'delete',
                  version: 4,
                  data: null
                }
              }))
            : appliedTo(body, 5)
      })),
      { 'readingAids.romaji': true }
    )
    await world.signIn()
    await world.settled()
    expect(settingsSent(world).map(sent => sent.baseVersion)).toEqual([0, 0])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
  })
})
