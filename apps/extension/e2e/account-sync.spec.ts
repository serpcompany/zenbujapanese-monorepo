import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { accountLabels } from '../src/account/labels.ts'
import { settingDefaults } from '../src/shared/settings.ts'
import {
  change,
  kanji,
  knownItems,
  knownOnTheAccount,
  onTheAccount,
  readCopy,
  recordSyncs,
  syncNow,
  word
} from './account-copy.ts'
import {
  account,
  answered,
  newEmail,
  openAccountPage,
  signedOutTitle,
  signInWithGoogle,
  startSignedOut
} from './account-pages.ts'
import { testPage } from './expected.ts'
import { contentScriptSurface, type Extension, expect, openProfile, test } from './fixtures.ts'

test.use({ accountService: true })

const syncAt = (extension: Extension) => `${account(extension).origin}/v1/sync`

async function signedIn(page: Page, extension: Extension, email: string): Promise<Locator> {
  const view = await openAccountPage(page, extension)
  await signInWithGoogle(view, account(extension), email)
  return view
}

const synced = async (page: Page) => (await syncNow(page)).unsynced

const favorites = '2177c773-9e88-410f-9348-6cefaebe0a93'

const changedSettings = {
  'readingAids.furigana': false,
  'readingAids.romaji': true,
  'readingAids.wordMeanings': true,
  'readingAids.furiganaHiddenOnKnownWords': true,
  'readingAids.translations': false,
  'frequencyDictionaries.chosen': ['zenbu.jlpt.waller.levels']
}

const syncedNames = Object.keys(changedSettings) as (keyof typeof changedSettings)[]

const settingsIn = (on: Page) => on.evaluate(names => chrome.storage.local.get(names), syncedNames)

const setSettings = (on: Page, settings: Record<string, unknown>) =>
  on.evaluate(next => chrome.storage.local.set(next), settings)

const defaults = Object.fromEntries(syncedNames.map(name => [name, settingDefaults[name]]))

test.beforeEach(async ({ extension, page }) => {
  await startSignedOut(page, extension)
})

test.afterEach(async ({ extension }) => {
  await extension.context.unroute(syncAt(extension))
})

test('words, kanji, a list with a word, a note and the synced settings reach the account and a second browser signed in to it, and a change made there comes back', async ({
  extension,
  page,
  playwright
}) => {
  const email = newEmail('sync')
  const note = randomUUID()
  await signedIn(page, extension, email)
  try {
    await change(page, { change: 'mark', ...word })
    await change(page, { change: 'mark', ...kanji })
    await change(page, { change: 'create-list', list: favorites, name: 'Favorites', position: 0 })
    await change(page, { change: 'add-word', list: favorites, ...word })
    await change(page, { change: 'write-note', note, text: 'Needed, not wanted.', ...word })
    await setSettings(page, changedSettings)
    await expect.poll(() => synced(page)).toBe(0)
    expect(knownOnTheAccount(await onTheAccount(account(extension), extension))).toEqual(
      [word.item, kanji.item].sort()
    )
    const second = await openProfile(playwright, extension)
    try {
      const secondPage = await second.context.newPage()
      await signedIn(secondPage, second, email)
      await expect
        .poll(async () => {
          const copy = await readCopy(secondPage)
          return {
            known: knownItems(copy),
            lists: copy.lists.map(list => [list.id, list.words.map(each => each.item)]),
            notes: copy.notes.map(each => [each.id, each.item, each.text])
          }
        })
        .toEqual({
          known: [word.item, kanji.item].sort(),
          lists: [[favorites, [word.item]]],
          notes: [[note, word.item, 'Needed, not wanted.']]
        })
      await expect.poll(() => settingsIn(secondPage)).toEqual(changedSettings)
      await change(secondPage, { change: 'clear', item: kanji.item })
      await expect.poll(() => synced(secondPage)).toBe(0)
    } finally {
      await second.close()
    }
    await expect.poll(async () => knownItems(await syncNow(page))).toEqual([word.item])
  } finally {
    await setSettings(page, defaults)
  }
})

test('the translation language and source come down from the account, and the extension never sends either', async ({
  extension,
  page
}) => {
  const syncs = recordSyncs(extension)
  await signedIn(page, extension, newEmail('translation'))
  await onTheAccount(
    account(extension),
    extension,
    [
      ['readingAids.translationSource', 'apple'],
      ['readingAids.translationLanguage', 'ja']
    ].map(([name, value]) => ({
      id: randomUUID(),
      entity: 'setting',
      operation: 'set',
      entityId: name,
      baseVersion: 0,
      fields: { value }
    }))
  )
  await expect
    .poll(async () => (await syncNow(page)).accountSettings)
    .toEqual({ 'readingAids.translationSource': 'apple', 'readingAids.translationLanguage': 'ja' })
  syncs.stop()
  expect(syncs.bodies.length).toBeGreaterThan(0)
  expect(syncs.bodies.join('\n')).not.toMatch(/translation(Source|Language)/)
})

test('another account signing in replaces the copy, after the signed-out Account page says how many changes that removes', async ({
  extension,
  page
}) => {
  const first = newEmail('first')
  const second = newEmail('second')
  const view = await signedIn(page, extension, first)
  await change(page, { change: 'mark', ...word })
  await expect.poll(() => synced(page)).toBe(0)
  await extension.context.route(syncAt(extension), route => route.abort('internetdisconnected'))
  await change(page, { change: 'mark', ...kanji })
  await expect.poll(async () => (await readCopy(page)).sync).toBe('offline')
  await view.getByRole('button', { name: accountLabels.signOut }).click()
  await expect(view.getByText(signedOutTitle)).toBeVisible()
  await expect(change(page, { change: 'mark', ...word })).resolves.toEqual({
    type: 'refused',
    refusal: 'signed-out'
  })
  await extension.context.unroute(syncAt(extension))
  await page.reload()
  await expect(view.locator('[data-account-unsynced]')).toHaveText(accountLabels.unsynced(1, first))
  await signInWithGoogle(view, account(extension), second)
  await expect
    .poll(async () => {
      const copy = await syncNow(page)
      return [copy.owner, knownItems(copy), copy.unsynced]
    })
    .toEqual([second, [], 0])
  expect(knownOnTheAccount(await onTheAccount(account(extension), extension))).toEqual([])
})

test('a change queued while the account service is out of reach stays through signing out, and goes up when the same account signs in again', async ({
  extension,
  page
}) => {
  const email = newEmail('offline')
  const view = await signedIn(page, extension, email)
  await extension.context.route(syncAt(extension), route => route.abort('internetdisconnected'))
  await change(page, { change: 'mark', ...word })
  await expect.poll(async () => (await readCopy(page)).sync).toBe('offline')
  await view.getByRole('button', { name: accountLabels.signOut }).click()
  await expect(view.getByText(signedOutTitle)).toBeVisible()
  await expect(readCopy(page)).resolves.toMatchObject({ unsynced: 1, knownWords: [word] })
  await extension.context.unroute(syncAt(extension))
  await signInWithGoogle(view, account(extension), email)
  await expect.poll(async () => (await readCopy(page)).unsynced).toBe(0)
  expect(knownOnTheAccount(await onTheAccount(account(extension), extension))).toEqual([word.item])
})

test('a sync refused for no cloud access keeps the change, reads the subscription again, and waits for Sync Now', async ({
  extension,
  page
}) => {
  await signedIn(page, extension, newEmail('paywall'))
  await extension.context.route(syncAt(extension), route =>
    route.fulfill({
      status: 402,
      json: { error: { code: 'subscription_required', message: 'Subscribe to sync.' } }
    })
  )
  const reread = answered(extension, '/v1/me/subscription')
  await change(page, { change: 'mark', ...word })
  await reread
  await expect.poll(async () => (await readCopy(page)).sync).toBe('subscription-required')
  await expect(readCopy(page)).resolves.toMatchObject({ unsynced: 1 })
  expect(knownOnTheAccount(await onTheAccount(account(extension), extension))).toEqual([])
  await extension.context.unroute(syncAt(extension))
  await expect.poll(() => synced(page)).toBe(0)
})

test('a content script hears whether a word is known as it changes, and the page it runs on holds no copy', async ({
  extension,
  page
}) => {
  await signedIn(page, extension, newEmail('known'))
  const site = await extension.context.newPage()
  await site.goto(`${extension.server.url}${testPage}`)
  const known = (item: string) => contentScriptSurface(site).locator(`[data-known-item="${item}"]`)
  await expect(known(word.item)).toHaveAttribute('data-known', 'false')
  await change(page, { change: 'mark', ...word })
  await expect(known(word.item)).toHaveAttribute('data-known', 'true')
  await expect(known(kanji.item)).toHaveAttribute('data-known', 'false')
  const databases = (on: Page) =>
    on.evaluate(async () => (await indexedDB.databases()).map(database => database.name))
  expect(await databases(site)).not.toContain('zenbu-account-copy')
  expect(await databases(page)).toContain('zenbu-account-copy')
  await site.close()
})
