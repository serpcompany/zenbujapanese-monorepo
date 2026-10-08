import type { Page } from '@playwright/test'
import { expect, footerAccountLink, test } from './test'

const accountService = process.env.ZENBU_ACCOUNT_API_URL ?? 'http://localhost:8789'
const elevenMinutes = 11 * 60_000

type Requests = Page['request']

test.skip(
  process.env.ZENBU_ACCOUNT_API !== '1',
  'Runs against a local account service with its dev mailbox: ZENBU_ACCOUNT_API=1 (docs/agents/web.md, Account pages)'
)

async function codesTo(request: Requests, email: string): Promise<string[]> {
  const mail = (await (await request.get(`${accountService}/dev/mail`)).json()) as {
    messages: { to: string; text: string }[]
  }
  return mail.messages
    .filter(message => message.to === email)
    .flatMap(message => /code is (\d{6})/.exec(message.text)?.[1] ?? [])
}

async function enterEmailedCode(page: Page, request: Requests, email: string, submit: string) {
  const before = (await codesTo(request, email)).length
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible()
  let code = ''
  await expect
    .poll(async () => {
      const newestFirst = await codesTo(request, email)
      code = newestFirst.length > before ? (newestFirst[0] ?? '') : ''
      return code
    })
    .toMatch(/^\d{6}$/)
  await page.getByLabel('Code').fill(code)
  await page.getByRole('button', { name: submit }).click()
}

test('a learner registers with an emailed code, edits the account, signs out, signs in again, and deletes it', async ({
  page,
  request
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'One run sends three codes; the service allows five per address in 10 minutes'
  )
  const email = `learner-${Date.now()}@example.com`
  const username = `learner_${Date.now() % 1_000_000}`
  await page.clock.install()

  await page.goto('/register/')
  await page.getByLabel('Email').fill(email)
  await enterEmailedCode(page, request, email, 'Create account')
  await expect(page).toHaveURL(/\/account\/$/)
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
  await expect(footerAccountLink(page)).toHaveText('Account')
  await expect(page.getByRole('listitem').filter({ hasText: 'A code we email you' })).toContainText(
    email
  )

  await page.getByLabel('Name', { exact: true }).fill('Kana Fan')
  await page.getByLabel('Username').fill(username)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kana Fan')
  await expect(page.getByLabel('Username')).toHaveValue(username)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('You’re signed out.')).toBeVisible()
  await expect(footerAccountLink(page)).toHaveText('Sign in')
  await page.reload()
  await expect(page.getByText('You’re not signed in.')).toBeVisible()

  await page.goto('/forgot-password/')
  await page.getByLabel('Email').fill(email)
  await enterEmailedCode(page, request, email, 'Sign in')
  await expect(page).toHaveURL(/\/account\/$/)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kana Fan')

  await page.clock.setSystemTime(Date.now() + elevenMinutes)
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.getByText(`Delete ${email} and everything it synced?`)).toBeVisible()
  await page.getByRole('button', { name: 'Delete my account' }).click()
  const confirm = page.getByRole('region', { name: 'Confirm it’s you' })
  await expect(confirm).toContainText(`We’ll email a code to ${email}`)
  await enterEmailedCode(page, request, email, 'Confirm')
  await expect(page.getByText('Your account is deleted.')).toBeVisible()
  await expect(footerAccountLink(page)).toHaveText('Sign in')

  await page.reload()
  await expect(page.getByText('You’re not signed in.')).toBeVisible()
})
