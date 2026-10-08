import type { Page } from '@playwright/test'
import { accountButton, accountMenu, expect, menuButton, onPhone, phoneMenu, test } from './test'

type Theme = 'Light' | 'Dark' | 'System'

const root = (page: Page) => page.locator('html')

async function openTheThemeChoices(page: Page) {
  if (onPhone()) {
    await menuButton(page).click()
    await phoneMenu(page).getByRole('button', { name: 'Theme' }).click()
    return page.getByRole('menu', { name: 'Theme' })
  }
  await accountButton(page).click()
  return accountMenu(page)
}

async function choose(page: Page, theme: Theme) {
  const choices = await openTheThemeChoices(page)
  await choices.getByRole('menuitemradio', { name: theme }).click()
  await page.keyboard.press('Escape')
  if (onPhone()) await page.keyboard.press('Escape')
  await expect(phoneMenu(page)).toBeHidden()
}

test.describe('theme', () => {
  test('System is the default, and follows the operating system as it changes', async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/about/')
    await expect(root(page)).toHaveClass(/\bdark\b/)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(root(page)).toHaveClass(/\blight\b/)
    const choices = await openTheThemeChoices(page)
    await expect(choices.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('the choice survives a reload, whatever the operating system says', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/about/')
    await choose(page, 'Dark')
    await expect(root(page)).toHaveClass(/\bdark\b/)
    await page.reload()
    await expect(root(page)).toHaveClass(/\bdark\b/)
    await page.emulateMedia({ colorScheme: 'dark' })
    await choose(page, 'Light')
    await page.goto('/dictionary/')
    await expect(root(page)).toHaveClass(/\blight\b/)
    const choices = await openTheThemeChoices(page)
    await expect(choices.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('the choice changes by keyboard, in the account menu or, on phones, the drawer', async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/about/')
    if (onPhone()) {
      await menuButton(page).focus()
      await page.keyboard.press('Enter')
      await expect(phoneMenu(page)).toBeVisible()
      await phoneMenu(page).getByRole('button', { name: 'Theme' }).focus()
    } else {
      await accountButton(page).focus()
    }
    await page.keyboard.press('Enter')
    const choices = onPhone() ? page.getByRole('menu', { name: 'Theme' }) : accountMenu(page)
    await expect(choices).toBeVisible()
    await page.keyboard.press('End')
    await expect(choices.getByRole('menuitemradio', { name: 'System' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(choices.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(root(page)).toHaveClass(/\bdark\b/)
    if (onPhone()) await expect(choices).toBeHidden()
    else await expect(choices.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  })

  test.describe('before the page’s scripts run', () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    test('a saved choice is already applied, so the page never shows the other theme first', async ({
      page
    }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'))
      await page.route('**/_next/static/**/*.js', route => route.abort())
      await page.goto('/about/')
      await expect(root(page)).toHaveClass(/\bdark\b/)
      await expect(root(page)).toHaveCSS('color-scheme', 'dark')
    })
  })
})
