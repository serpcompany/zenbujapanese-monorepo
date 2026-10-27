import type { Page } from '@playwright/test'
import { SyncedStandIn } from '../src/test/synced-stand-in'
import { signedInService, signedOutService, standInForTheAccountService } from './account-stand-in'
import { axeFailures } from './axe'
import { phoneLayoutProblems } from './phone-checks'
import { expect, sidewaysOverflow, test } from './test'

const food = '2177c773-9e88-410f-9348-6cefaebe0a93'
const iru = 'd12d09f1107aef0f7d43b54b62f0b7e1'
const hairu = 'e36e4bdfdf4b6535e82b863470af9499'
const dropped = 'f'.repeat(32)
const needed = { headword: '要る', reading: 'いる' }
const entered = { headword: '入る', reading: 'いる' }

const anAccount = () =>
  new SyncedStandIn()
    .holds('list', food, { id: food, name: 'Food', position: 0, createdAt: '2026-10-01T12:00:00Z' })
    .holds('listWord', `${food}/${iru}`, {
      listId: food,
      itemId: iru,
      ...needed,
      addedAt: '2026-10-01T12:00:00Z'
    })
    .holds('listWord', `${food}/${hairu}`, {
      listId: food,
      itemId: hairu,
      ...entered,
      addedAt: '2026-10-02T12:00:00Z'
    })
    .holds('knownWord', hairu, { itemId: hairu, ...entered, known: true })
    .holds('wordNote', 'n1', { id: 'n1', itemId: iru, text: 'Seen on a menu.', ...needed })
    .holds('wordNote', 'n2', {
      id: 'n2',
      itemId: dropped,
      text: 'An old name.',
      headword: '貞はる',
      reading: 'さだはる'
    })
    .holds('recentSearch', 's1', { id: 's1', query: '猫', searchedAt: '2026-10-01T12:00:00Z' })

async function signedInWith(page: Page, standIn = anAccount()) {
  await standInForTheAccountService(page, signedInService, standIn)
  return standIn
}

const main = (page: Page) => page.getByRole('main')

const syncedPaths = [
  '/account/known-words/',
  '/account/lists/',
  '/account/notes/',
  '/account/media-library/',
  '/account/recent-videos/',
  '/account/bookmarks/',
  '/account/recent-searches/',
  '/account/settings/'
]

test.describe("an account's synced data", () => {
  test('the account page links each kind, and Lists opens to the lists with their word counts', async ({
    page
  }) => {
    await signedInWith(page)
    await page.goto('/account/')
    const synced = main(page).getByRole('region', { name: 'Your synced data' })
    await expect(synced.getByRole('link')).toHaveText([
      /^Known Words/,
      /^Lists/,
      /^Notes/,
      /^Media Library/,
      /^Recent videos/,
      /^Bookmarked sentences/,
      /^Recent searches/,
      /^Settings/
    ])
    await synced.getByRole('link', { name: /^Lists/ }).click()
    await expect(page).toHaveURL(/\/account\/lists\/$/)
    await expect(main(page).getByRole('link', { name: 'Food' })).toBeVisible()
    await expect(main(page).getByText('2 words')).toBeVisible()
    expect(await sidewaysOverflow(page)).toBe(0)
  })

  test('a list opens to its words, newest first, with Known marked, and a word comes off it', async ({
    page
  }) => {
    const standIn = await signedInWith(page)
    await page.goto(`/account/lists/?list=${food}`)
    const words = main(page).getByRole('region', { name: 'Food' })
    await expect(words.getByRole('link', { name: /（/ })).toHaveText([
      '入る（いる）',
      '要る（いる）'
    ])
    await expect(words.getByText('Known', { exact: true })).toHaveCount(1)
    await words.getByRole('button', { name: 'Remove 要る（いる） from this list' }).click()
    await expect(words.getByText('1 word', { exact: true })).toBeVisible()
    expect(standIn.sent).toMatchObject([
      { entity: 'listWord', operation: 'remove', entityId: `${food}/${iru}`, baseVersion: 1 }
    ])
    expect(await sidewaysOverflow(page)).toBe(0)
  })

  test('a word opens its own page, and a note on a word the dictionary dropped is listed without a word', async ({
    page
  }) => {
    await signedInWith(page)
    await page.goto(`/account/lists/?list=${food}`)
    await main(page).getByRole('link', { name: '要る（いる）' }).click()
    await expect(page).toHaveURL(new RegExp(`/dictionary/${encodeURI('要る')}-1546640/$`))
    await expect(page.getByRole('heading', { level: 1, name: /要る/ })).toBeVisible()
    await page.goto('/ja/account/notes/')
    await expect(main(page).getByRole('link', { name: '要る（いる）' })).toHaveAttribute(
      'href',
      '/ja/dictionary/要る-1546640/'
    )
    const without = main(page).getByRole('region', { name: '単語のないメモ' })
    await expect(without.getByText('An old name.')).toBeVisible()
    await expect(without.getByRole('button', { name: /編集/ })).toHaveCount(0)
  })

  test('a new list is made, and Known Words marks a word unknown', async ({ page }) => {
    const standIn = await signedInWith(page)
    await page.goto('/account/lists/')
    await main(page).getByLabel('New List').fill('Verbs')
    await main(page).getByRole('button', { name: 'Create List' }).click()
    await expect(main(page).getByRole('link', { name: 'Verbs' })).toBeVisible()
    await page.goto('/account/known-words/')
    await main(page).getByRole('button', { name: 'Mark 入る（いる） as Unknown' }).click()
    await expect(
      main(page).getByText('You haven’t marked a word or kanji known yet.')
    ).toBeVisible()
    expect(standIn.sent.map(each => [each.entity, each.operation])).toEqual([
      ['list', 'create'],
      ['knownWord', 'clear']
    ])
  })

  test('a note is changed, a recent search cleared, and a frequency dictionary chosen', async ({
    page
  }) => {
    const standIn = await signedInWith(page)
    await page.goto('/account/notes/')
    await main(page).getByRole('button', { name: 'Edit your note on 要る（いる）' }).click()
    await main(page).getByRole('textbox', { name: 'Note' }).fill('Seen on a menu in Kyoto.')
    await main(page).getByRole('button', { name: 'Save' }).click()
    await expect(main(page).getByText('Seen on a menu in Kyoto.')).toBeVisible()
    await page.goto('/account/recent-searches/')
    await main(page).getByRole('button', { name: 'Clear All' }).click()
    await main(page).getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(main(page).getByText('No recent searches yet.')).toBeVisible()
    await page.goto('/account/settings/')
    await main(page).getByRole('button', { name: 'Use Anime' }).click()
    await expect(main(page).getByRole('button', { name: 'Stop using Anime' })).toBeVisible()
    expect(standIn.dataOf('setting', 'frequencyDictionaries.chosen')).toMatchObject({
      value:
        'zenbu.jlpt.waller.levels,zenbu.tubelex.youtube.ja.unidic-3.1,zenbu.jiten.anime.ja.ordered-v2'
    })
  })

  test.describe('on a phone', () => {
    test.skip(({ isMobile }) => !isMobile, 'These check the phone layout')
    test.use({
      viewport: { width: 360, height: 800 },
      allowedConsoleErrors: [/Failed to load resource: net::ERR_FAILED/]
    })

    for (const colorScheme of ['light', 'dark'] as const) {
      for (const path of [...syncedPaths, `/account/lists/?list=${food}`]) {
        test(`${path} fits a 360px phone, signed in, with its tap targets and contrast, in ${colorScheme}`, async ({
          page
        }) => {
          const standIn = anAccount()
            .holds('photo', 'f'.repeat(64), { name: 'Menu.jpg', savedAt: '2026-10-01T12:00:00Z' })
            .holds('watchedVideo', 'aaaaaaaaaaa', {
              title: 'A video',
              watchedAt: '2026-10-01T12:00:00Z'
            })
            .holds('bookmarkedSentence', 'b1', {
              text: 'はい。',
              language: 'ja',
              bookmarkedAt: '2026-10-01T12:00:00Z'
            })
            .holds('setting', 'readingAids.romaji', { name: 'readingAids.romaji', value: true })
          await signedInWith(page, standIn)
          await page.emulateMedia({ colorScheme })
          await page.goto(path)
          await expect(main(page).getByText('Loading…')).toHaveCount(0)
          await expect(main(page).getByRole('link', { name: 'Your account' })).toBeVisible()
          expect.soft(await phoneLayoutProblems(page)).toEqual({
            smallText: [],
            outsideTheViewport: [],
            clippedText: [],
            narrowGridCells: []
          })
          expect.soft(await axeFailures(page, 'target-size', { orUnclear: true })).toEqual([])
          expect.soft(await axeFailures(page, 'color-contrast')).toEqual([])
        })
      }
    }
  })

  test.describe('without a subscription', () => {
    test.use({ allowedConsoleErrors: [/status of 402/] })

    test('a page of synced data points to the subscription', async ({ page }) => {
      const standIn = anAccount()
      standIn.subscribed = false
      await signedInWith(page, standIn)
      await page.goto('/account/known-words/')
      await expect(main(page).getByText(/needs a subscription/)).toBeVisible()
      await main(page).getByRole('link', { name: 'See the subscription' }).click()
      await expect(page).toHaveURL(/\/account\/#subscription$/)
      expect(standIn.sent).toEqual([])
    })
  })

  test('signed out, a page of synced data offers signing in, and the Japanese one says it in Japanese', async ({
    page
  }) => {
    await standInForTheAccountService(page, signedOutService)
    await page.goto('/account/notes/')
    await expect(main(page).getByText('You’re not signed in.')).toBeVisible()
    await page.goto('/ja/account/notes/')
    await expect(page.getByRole('heading', { level: 1, name: 'メモ' })).toBeVisible()
    await expect(main(page).getByText('ログインしていません。')).toBeVisible()
  })
})
