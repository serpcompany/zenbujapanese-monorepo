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
