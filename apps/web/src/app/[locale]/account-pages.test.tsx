import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import ExtensionPage from './account/extension/page'
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

const pagesIn = (locale: Locale) => {
  const params = Promise.resolve({ locale })
  return {
    '/login/': () => LoginPage({ params, searchParams } as PageProps<'/[locale]/login'>),
    '/register/': () => RegisterPage({ params, searchParams } as PageProps<'/[locale]/register'>),
    '/forgot-password/': () =>
      ForgotPasswordPage({ params, searchParams } as PageProps<'/[locale]/forgot-password'>),
    '/account/': () => AccountPage({ params, searchParams } as PageProps<'/[locale]/account'>),
    '/account/extension/': () =>
      ExtensionPage({ params, searchParams } as PageProps<'/[locale]/account/extension'>)
  }
}

const pages = pagesIn('en')

const accountLinks = (html: string) =>
  [...html.matchAll(/href="((?:\/ja)?\/(?:login|register|forgot-password|account)\/)"/g)].map(
    ([, href]) => href
  )

const emailOnly = { apiUrl: 'https://api.example.com', appleServicesId: null, google: false }

describe('the account pages', () => {
  test.each(
    Object.entries(pages)
  )("%s says signing in isn't available, and links no account page, without an account service", async (_, page) => {
    const html = renderToStaticMarkup(await page())
    expect(html).toContain('isn’t available on this site yet')
    expect(html).not.toContain('Email me a code')
    expect(html).not.toContain('a code')
    expect(html).not.toContain('See your profile')
    expect(accountLinks(html)).toEqual([])
  })

  test('offer signing in, and lead to each other, with an account service', async () => {
    settings.current = emailOnly
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
      'See your profile and how you sign in, change your profile, or delete your account.'
    )
  })

  test('/forgot-password/ points to Sign in only for the ways the site offers, naming them', async () => {
    for (const [appleServicesId, google, line] of [
      [null, false, null],
      ['com.zenbujapanese.website', false, 'Made your account with Apple?'],
      [null, true, 'Made your account with Google?'],
      ['com.zenbujapanese.website', true, 'Made your account with Apple or Google?']
    ] as const) {
      settings.current = { apiUrl: 'https://api.example.com', appleServicesId, google }
      const html = renderToStaticMarkup(await pages['/forgot-password/']())
      expect(html).toContain('Email me a code')
      const offered = /Made your account with [^?]+\?/.exec(html)?.[0] ?? null
      expect(offered).toBe(line)
      expect(accountLinks(html)).toEqual(line ? ['/login/'] : [])
    }
  })

  test('are in Japanese under /ja/, leading to the Japanese account pages and policy', async () => {
    const japanese = pagesIn('ja')
    expect(renderToStaticMarkup(await japanese['/login/']())).toContain(
      'このサイトでは、Zenbuアカウントへのログインにまだ対応していません。'
    )
    settings.current = { ...emailOnly, appleServicesId: 'com.zenbujapanese.website', google: true }
    const login = renderToStaticMarkup(await japanese['/login/']())
    expect(login).toContain('<h1 class="text-2xl font-semibold">ログイン</h1>')
    expect(login).toContain('Appleでサインイン')
    expect(login).toContain('コードをメールで受け取る')
    expect(accountLinks(login)).toEqual(['/ja/register/', '/ja/forgot-password/'])
    const register = renderToStaticMarkup(await japanese['/register/']())
    expect(accountLinks(register)).toEqual(['/ja/login/', '/ja/forgot-password/'])
    expect(register).toContain('href="/ja/legal/privacy/">プライバシーポリシー</a>')
    const forgot = renderToStaticMarkup(await japanese['/forgot-password/']())
    expect(forgot).toContain('AppleまたはGoogleでアカウントを作成した場合は、')
    expect(accountLinks(forgot)).toEqual(['/ja/login/'])
    expect(renderToStaticMarkup(await japanese['/account/']())).toContain(
      'アカウントを読み込んでいます…'
    )
  })
})
