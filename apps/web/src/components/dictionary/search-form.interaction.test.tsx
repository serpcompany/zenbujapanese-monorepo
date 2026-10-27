import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { SearchForm } from './search-form'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn()
}))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/dictionary/',
  useSearchParams: () => new URLSearchParams()
}))

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

async function type(input: HTMLInputElement, text: string) {
  for (const key of text) {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      valueSetter?.call(input, input.value + key)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
  await act(async () => vi.runAllTimers())
}

test.each([
  ['en', '/dictionary/search/'],
  ['ja', '/ja/dictionary/search/']
] as const)('typing in the box searches nothing; the form submits it to the search page (%s)', async (locale, searchPage) => {
  vi.useFakeTimers()
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const form = createRoot(document.body.appendChild(document.createElement('div')))
  try {
    act(() =>
      form.render(<SearchForm locale={locale} text={getDictionary(locale).searchForm} autoFocus />)
    )
    const address = window.location.href
    const visited = window.history.length
    const box = document.querySelector<HTMLInputElement>('input[type="text"]')
    if (!box) throw new Error('The form has no search box')
    await type(box, 'iru')
    expect(box.value).toBe('iru')
    expect(fetcher).not.toHaveBeenCalled()
    expect(Object.values(router).filter(navigate => navigate.mock.calls.length > 0)).toEqual([])
    expect([window.location.href, window.history.length]).toEqual([address, visited])
    expect([box.form?.getAttribute('action'), box.form?.getAttribute('method'), box.name]).toEqual([
      searchPage,
      'get',
      'q'
    ])
  } finally {
    act(() => form.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

test.each([
  ['a signed-in learner', true, '要る'],
  ['a signed-out visitor', false, null]
])('submitting marks the search as asked for %s, normalized, for Recent searches', (_, signedIn, asked) => {
  vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open')
  vi.stubEnv('ZENBU_ACCOUNT_SERVICE', 'https://api.example.com')
  if (signedIn) window.localStorage.setItem('zenbu-signed-in', 'yes')
  const form = createRoot(document.body.appendChild(document.createElement('div')))
  const stay = (event: Event) => event.preventDefault()
  document.addEventListener('submit', stay)
  try {
    act(() => form.render(<SearchForm locale="en" text={getDictionary('en').searchForm} />))
    const box = document.querySelector<HTMLInputElement>('input[name="q"]')
    if (!box) throw new Error('The form has no search box')
    box.value = '  要る '
    act(() => box.form?.requestSubmit())
    expect(window.sessionStorage.getItem('search.asked')).toBe(asked)
  } finally {
    document.removeEventListener('submit', stay)
    act(() => form.unmount())
    vi.unstubAllEnvs()
    window.localStorage.clear()
    window.sessionStorage.clear()
  }
})
