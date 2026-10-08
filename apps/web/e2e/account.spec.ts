import { signedOutService, standInForTheAccountService } from './account-stand-in'
import {
  accountButton,
  accountPages,
  expect,
  footerAccountLink,
  headerLogIn,
  onPhone,
  test
} from './test'

const email = 'kana@example.com'
const profile = {
  id: 'u1',
  name: 'Kana Fan',
  username: null,
  email,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
}

const accessTokenFor = (sub: string) =>
  `head.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`

test.describe('account pages', () => {
  for (const { path, title } of accountPages) {
    test(`${path} is noindex, with the site's header and footer`, async ({ page }) => {
      await standInForTheAccountService(page, signedOutService)
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Zenbu Japanese' })
      ).toBeVisible()
      await expect(page).toHaveTitle(`${title} | Zenbu Japanese`)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow'
      )
      await expect(footerAccountLink(page)).toBeVisible()
    })
  }

  test('no sitemap lists them', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The sitemaps are the same at every width')
    const pagesXml = await (await request.get('/sitemaps/pages.xml')).text()
    await page.goto('/sitemap/')
    const htmlSitemap = await page
      .getByRole('main')
      .getByRole('link')
      .evaluateAll(links => links.map(link => link.getAttribute('href')).join('\n'))
    expect(htmlSitemap).toContain('/legal/privacy/')
    for (const { path } of accountPages) {
      expect(pagesXml).not.toContain(path)
      expect(htmlSitemap).not.toContain(path)
    }
  })

  test('the footer leads to signing in, and to the account once signed in, as the header shows the initials', async ({
    page
  }) => {
    await standInForTheAccountService(page, {
      'POST /v1/auth/email-otp/send-verification-otp': { success: true },
      'POST /v1/auth/sign-in/email-otp': { token: 'bare', user: { id: 'u1' } },
      'GET /v1/auth/get-session': {
        user: { id: 'u1', email },
        session: { token: 'bare', createdAt: new Date().toISOString() }
      },
      'GET /v1/auth/token': { token: accessTokenFor(profile.id) },
      'GET /v1/me': profile,
      'GET /v1/auth/list-accounts': [{ id: 'i1', providerId: 'email', accountId: email }]
    })
    await page.goto('/')
    await expect(footerAccountLink(page)).toHaveText('Sign in')
    await footerAccountLink(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await page.getByLabel('Code').fill('123456')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
    await expect(footerAccountLink(page)).toHaveText('Account')
    await expect(footerAccountLink(page)).toHaveAttribute('href', '/account/')
    if (!onPhone()) await expect(accountButton(page)).toHaveText(/^KF/)
  })

  test("the account menu's Log in, or the drawer's on phones, opens the login page", async ({
    page
  }) => {
    await standInForTheAccountService(page, signedOutService)
    await page.goto('/about/')
    const logIn = await headerLogIn(page)
    await expect(logIn).toHaveAttribute('data-link-target', 'login')
    await logIn.click()
    await expect(page).toHaveURL(/\/login\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  })

  test('Sign in\'s "Can\'t sign in?" leads to signing in by email code', async ({ page }) => {
    await standInForTheAccountService(page, signedOutService)
    await page.goto('/login/')
    await page.getByRole('link', { name: 'Can’t sign in?' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'No password needed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
  })

  test.describe('without the account service', () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    test("the account page says it can't reach it, and offers to try again", async ({ page }) => {
      await standInForTheAccountService(page, {})
      await page.goto('/account/')
      await expect(page.getByText('We couldn’t reach your Zenbu account')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    })
  })
})
