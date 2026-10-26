import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readingAidStorageKey, readingAidsScript } from '@/lib/reading-aids'
import { useReadingAid } from './use-reading-aid'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

const documentRoot = () => document.documentElement

function Romaji() {
  const [shown, show] = useReadingAid('romaji')
  return (
    <button type="button" aria-pressed={shown} onClick={() => show(!shown)}>
      Show Romaji
    </button>
  )
}

const button = () => container.querySelector('button') as HTMLButtonElement

function mount() {
  act(() => root.render(<Romaji />))
}

beforeEach(() => {
  window.localStorage.clear()
  for (const name of documentRoot().getAttributeNames()) {
    if (name.startsWith('data-')) documentRoot().removeAttribute(name)
  }
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
})

describe('a Reading Aid setting', () => {
  test('reads what the script in the head set, and keeps a change for the next page', () => {
    window.localStorage.setItem(readingAidStorageKey('romaji'), 'true')
    new Function(readingAidsScript)()
    mount()
    expect(button().getAttribute('aria-pressed')).toBe('true')
    act(() => button().click())
    expect(button().getAttribute('aria-pressed')).toBe('false')
    expect(documentRoot().getAttribute('data-romaji')).toBe('off')
    expect(window.localStorage.getItem(readingAidStorageKey('romaji'))).toBe('false')
  })

  test('is the app’s default before anything is kept', () => {
    mount()
    expect(button().getAttribute('aria-pressed')).toBe('false')
    act(() => button().click())
    expect(documentRoot().getAttribute('data-romaji')).toBe('on')
  })

  test('follows a change made in another tab', () => {
    new Function(readingAidsScript)()
    mount()
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: readingAidStorageKey('romaji'), newValue: 'true' })
      )
    })
    expect(documentRoot().getAttribute('data-romaji')).toBe('on')
    expect(button().getAttribute('aria-pressed')).toBe('true')
  })
})
