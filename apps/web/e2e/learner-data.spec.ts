import type { Page } from '@playwright/test'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { SyncedStandIn } from '../src/test/synced-stand-in'
import { seemSignedIn, signedInService, standInForTheAccountService } from './account-stand-in'
import { expect, needed, test } from './test'

const t = getDictionary('en')
const lists = t.account.synced.lists
const itemId = fixtureWordRows.find(rows => rows.entry.entSeq === 1546640)?.entry.id ?? ''
const food = '1a2b3c4d-0000-4000-8000-000000000001'

async function signedInWith(page: Page, standIn: SyncedStandIn) {
  await seemSignedIn(page, 'KF')
  await standInForTheAccountService(page, signedInService, standIn)
  await page.goto(needed.path)
  return standIn
}

const sectionButton = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button', { name, exact: true })

test.describe("a signed-in subscriber changes the word's synced data on its page", () => {
  test('Add to List puts the word in a list, and New List makes one holding it', async ({
    page
  }) => {
    const standIn = await signedInWith(
      page,
      new SyncedStandIn().holds('list', food, {
        id: food,
        name: 'Food',
        position: 0,
        createdAt: '2026-10-01T00:00:00.000Z'
      })
    )
    await sectionButton(page, t.learner.prompts.lists.title).click()
    const dialog = page.getByRole('dialog', { name: t.learner.prompts.lists.title })
    const inFood = dialog.getByRole('checkbox', { name: 'Food' })
    await expect(inFood).not.toBeChecked()
    await inFood.click()
    await expect(inFood).toBeChecked()
    expect(standIn.dataOf('listWord', `${food}/${itemId}`)).toMatchObject({
      headword: needed.headword,
      reading: needed.reading
    })
    await dialog.getByRole('button', { name: lists.newList }).click()
    await dialog.getByLabel(lists.name).fill('Travel')
    await dialog.getByRole('button', { name: lists.create }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Travel' })).toBeChecked()
    expect(standIn.sent.map(each => [each.entity, each.operation])).toEqual([
      ['listWord', 'add'],
      ['list', 'create'],
      ['listWord', 'add']
    ])
    await expect(dialog.getByRole('button', { name: 'Open Food' })).toHaveAttribute(
      'href',
      `/account/lists/?list=${food}`
    )
    await dialog.getByRole('button', { name: t.learner.synced.done }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('Add Note writes a note on the word', async ({ page }) => {
    const standIn = await signedInWith(page, new SyncedStandIn())
    await sectionButton(page, t.learner.prompts.notes.title).click()
    const dialog = page.getByRole('dialog', { name: t.learner.synced.notes.title })
    await dialog.getByLabel(t.learner.synced.notes.newNote).fill('「要る」は必要。')
    await dialog.getByRole('button', { name: t.learner.addNote }).click()
    await expect(dialog.getByRole('textbox', { name: 'Note 1' })).toHaveValue('「要る」は必要。')
    expect(standIn.sent[0]?.fields).toEqual({
      item: itemId,
      text: '「要る」は必要。',
      headword: needed.headword,
      reading: needed.reading
    })
  })

  test('Mark as Known, from More actions, marks the word Known', async ({ page }) => {
    const standIn = await signedInWith(page, new SyncedStandIn())
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: t.learner.markKnown }).click()
    const dialog = page.getByRole('dialog', { name: t.learner.synced.known.title })
    await expect(dialog).toContainText(`${needed.headword} isn’t marked Known.`)
    await dialog.getByRole('button', { name: t.learner.markKnown }).click()
    await expect(dialog).toContainText(`${needed.headword} is marked Known.`)
    expect(standIn.dataOf('knownWord', itemId)).toMatchObject({ known: true })
  })
})

test.describe('a signed-in learner without a subscription', () => {
  test.use({ allowedConsoleErrors: [/status of 402 \(Payment Required\)/] })

  test('the dialog points to the subscription, and changes nothing', async ({ page }) => {
    const standIn = new SyncedStandIn()
    standIn.subscribed = false
    await signedInWith(page, standIn)
    await sectionButton(page, t.learner.prompts.notes.title).click()
    const dialog = page.getByRole('dialog', { name: t.learner.synced.notes.title })
    await expect(dialog).toContainText(t.account.synced.needsSubscription)
    await expect(
      dialog.getByRole('button', { name: t.account.synced.seeSubscription })
    ).toHaveAttribute('href', '/account/#subscription')
    expect(standIn.sent).toEqual([])
  })
})

test('signed out, the learner actions keep the get-the-app prompt, with Sign in', async ({
  page
}) => {
  await page.goto(needed.path)
  await sectionButton(page, t.learner.prompts.lists.title).click()
  const prompt = page.getByRole('dialog', { name: t.learner.inApp.addToList })
  await expect(prompt).toContainText(t.learner.appDescription)
  await expect(prompt.getByRole('button', { name: t.learner.signIn })).toHaveAttribute(
    'href',
    '/login/'
  )
  await expect(prompt.getByRole('button', { name: t.learner.getTheApp })).toBeVisible()
})
