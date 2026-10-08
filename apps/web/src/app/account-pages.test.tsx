import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccountSettings } from '@/lib/account/settings'
import AccountPage from './account/page'
import ForgotPasswordPage from './forgot-password/page'
import LoginPage from './login/page'
import RegisterPage from './register/page'

const settings = vi.hoisted(() => ({ current: null as AccountSettings | null }))

vi.mock('@/lib/account/settings', () => ({ accountSettings: async () => settings.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }))

afterEach(() => {
  settings.current = null
})

const searchParams = Promise.resolve({})

const pages = {
  '/login/': () => LoginPage({ searchParams } as PageProps<'/login'>),
  '/register/': () => RegisterPage({ searchParams } as PageProps<'/register'>),
  '/forgot-password/': () => ForgotPasswordPage(),
  '/account/': () => AccountPage({ searchParams } as PageProps<'/account'>)
}

const accountLinks = (html: string) =>
  [...html.matchAll(/href="(\/(?:login|register|forgot-password|account)\/)"/g)].map(
    ([, href]) => href
  )

describe('the account pages', () => {
  test.each(
    Object.entries(pages)
  )("%s says signing in isn't available, and links no account page, without an account service", async (_, page) => {
    const html = renderToStaticMarkup(await page())
    expect(html).toContain('isn’t available on this site yet')
    expect(html).not.toContain('Email me a code')
    expect(html).not.toContain('a code')
    expect(html).not.toContain('See and change your profile')
    expect(accountLinks(html)).toEqual([])
  })

  test('offer signing in, and lead to each other, with an account service', async () => {
    settings.current = { apiUrl: 'https://api.example.com', appleServicesId: null, google: false }
    const login = renderToStaticMarkup(await pages['/login/']())
    expect(login).toContain('Email me a code')
    expect(accountLinks(login)).toEqual(['/register/', '/forgot-password/'])
    expect(login).toContain('Can’t sign in?')
    expect(login).not.toContain('Forgot your password?')
    const register = renderToStaticMarkup(await pages['/register/']())
    expect(accountLinks(register)).toEqual(['/login/', '/forgot-password/'])
    expect(register).toContain('Can’t sign in?')
    expect(register).toContain('href="/legal/privacy/"')
    expect(renderToStaticMarkup(await pages['/account/']())).toContain(
      'See and change your profile and how you sign in, or delete your account.'
    )
  })

  test('/forgot-password/ points to Sign in only for the ways the site offers, naming them', async () => {
    for (const [appleServicesId, google, line] of [
      [null, false, null],
      ['com.zenbujapanese.web', false, 'Made your account with Apple?'],
      [null, true, 'Made your account with Google?'],
      ['com.zenbujapanese.web', true, 'Made your account with Apple or Google?']
    ] as const) {
      settings.current = { apiUrl: 'https://api.example.com', appleServicesId, google }
      const html = renderToStaticMarkup(await pages['/forgot-password/']())
      expect(html).toContain('Email me a code')
      const offered = /Made your account with [^?]+\?/.exec(html)?.[0] ?? null
      expect(offered).toBe(line)
      expect(accountLinks(html)).toEqual(line ? ['/login/'] : [])
    }
  })
})
