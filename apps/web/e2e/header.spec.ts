import type { Page } from '@playwright/test'
import { seemSignedIn, standInForTheAccountService } from './account-stand-in'
import { accountButton, accountMenu, expect, needed, onPhone, test } from './test'

const getTheApp = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: 'Get the app' })

async function headerActionBoxes(page: Page) {
  await expect(accountButton(page)).toBeVisible()
  return Promise.all([getTheApp(page).boundingBox(), accountButton(page).boundingBox()])
}

test.describe('the header', () => {
  test('stays pinned to the top while the page scrolls', async ({ page }) => {
    await page.goto(needed.path)
    const banner = page.getByRole('banner')
    await page.evaluate(() => window.scrollTo(0, 2000))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
    await expect(banner).toBeInViewport({ ratio: 1 })
    expect((await banner.boundingBox())?.y).toBe(0)
    await expect(banner.getByRole('link', { name: 'Zenbu Japanese' })).toBeInViewport()
  })
})

test.describe('the account menu from 1024 pixels', () => {
  test.beforeEach(() => {
    test.skip(onPhone(), 'Below 1024 pixels the drawer holds Log in or the account')
  })

  test('Get the app and the account button keep their places signed out and signed in', async ({
    page
  }) => {
    await page.goto('/about/')
    const signedOut = await headerActionBoxes(page)
    await expect(accountButton(page)).toHaveAccessibleName('Account')
    await seemSignedIn(page, 'KF')
    await page.reload()
    await expect(accountButton(page)).toHaveAccessibleName('Account, signed in')
    await expect(accountButton(page)).toHaveText(/KF/)
    expect(await headerActionBoxes(page)).toEqual(signedOut)
  })

  test('signed out, the menu offers Log in and Create an account, then the theme, by keyboard', async ({
    page
  }) => {
    await page.goto('/about/')
    await accountButton(page).focus()
    await page.keyboard.press('Enter')
    const menu = accountMenu(page)
    await expect(menu.getByRole('menuitem')).toHaveText(['Log in', 'Create an account'])
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'System'])
    await expect(menu.getByRole('menuitem', { name: 'Log in' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(accountButton(page)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Log in' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Create an account' })).toBeFocused()
    await expect(menu.getByRole('menuitem', { name: 'Create an account' })).toHaveAttribute(
      'data-link-target',
      'register'
    )
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/register\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
    await expect(menu).toBeHidden()
  })

  test('signed in, the menu leads to the account, then the theme, then Sign out, by keyboard', async ({
    page
  }) => {
    await standInForTheAccountService(page, { 'POST /v1/auth/sign-out': { success: true } })
    await seemSignedIn(page, 'KF')
    await page.goto('/about/')
    await accountButton(page).focus()
    await page.keyboard.press('Enter')
    const menu = accountMenu(page)
    await expect(menu.getByRole('menuitem')).toHaveText(['Your account', 'Sign out'])
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'System'])
    await expect(menu.getByRole('menuitem', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/account/'
    )
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    await expect(accountButton(page)).toHaveAccessibleName('Account')
    expect(await page.evaluate(() => window.localStorage.getItem('zenbu-signed-in'))).toBeNull()
  })
})
