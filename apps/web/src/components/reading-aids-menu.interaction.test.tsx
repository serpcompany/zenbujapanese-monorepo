// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readingAidStorageKey } from '@/lib/reading-aids'
import { ReadingAidsMenu } from './reading-aids-menu'

// The header's Reading Aids menu, in a DOM: each setting shows its stored state, and toggling one
// stores it and applies it to <html> at once, which is what shows or hides each aid's text.

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  for (const name of ['data-furigana', 'data-romaji', 'data-word-meanings', 'data-translations'])
    document.documentElement.removeAttribute(name)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

const item = (aid: string) =>
  document.querySelector<HTMLElement>(`[data-reading-aid-setting="${aid}"]`)

async function open() {
  const trigger = document.querySelector<HTMLElement>('[data-reading-aids-menu]')
  if (!trigger) throw new Error('No Reading Aids button')
  await act(async () => trigger.click())
}

describe('the Reading Aids menu', () => {
  test('lists the app’s settings with their defaults checked', async () => {
    act(() => root.render(<ReadingAidsMenu />))
    await open()
    expect(document.body.textContent).toContain('Reading Aids')
    expect(document.body.textContent).toContain('Meanings and Translations')
    const checked = (aid: string) => item(aid)?.getAttribute('aria-checked')
    expect([
      checked('furigana'),
      checked('romaji'),
      checked('wordMeanings'),
      checked('translations')
    ]).toEqual(['true', 'false', 'false', 'true'])
  })

  test('toggling a setting stores it and applies it to the page at once', async () => {
    act(() => root.render(<ReadingAidsMenu />))
    await open()
    await act(async () => item('romaji')?.click())
    expect(document.documentElement.getAttribute('data-romaji')).toBe('on')
    expect(JSON.parse(localStorage.getItem(readingAidStorageKey) ?? '{}')).toMatchObject({
      romaji: true,
      furigana: true
    })
    if (!item('furigana')) await open()
    await act(async () => item('furigana')?.click())
    expect(document.documentElement.getAttribute('data-furigana')).toBe('off')
    expect(item('furigana')?.getAttribute('aria-checked')).toBe('false')
  })

  test('shows the stored settings', async () => {
    localStorage.setItem(readingAidStorageKey, '{"translations":false,"wordMeanings":true}')
    act(() => root.render(<ReadingAidsMenu />))
    await open()
    expect(item('translations')?.getAttribute('aria-checked')).toBe('false')
    expect(item('wordMeanings')?.getAttribute('aria-checked')).toBe('true')
  })
})
