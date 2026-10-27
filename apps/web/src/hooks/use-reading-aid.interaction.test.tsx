import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readingAidStorageKey, readingAidsScript } from '@/lib/reading-aids'
import { useReadingAid } from './use-reading-aid'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const documentRoot = () => document.documentElement
const unmounts: (() => void)[] = []

function Romaji() {
  const [shown, show] = useReadingAid('romaji')
  return (
    <button type="button" aria-pressed={shown} onClick={() => show(!shown)}>
      Show Romaji
    </button>
  )
}

function romajiSwitch() {
  const holder = document.createElement('section')
  document.body.appendChild(holder)
  const switchRoot = createRoot(holder)
  act(() => switchRoot.render(<Romaji />))
  unmounts.push(() => {
    act(() => switchRoot.unmount())
    holder.remove()
  })
  return holder.querySelector('button') as HTMLButtonElement
}

const runTheHeadScript = () => new Function(readingAidsScript)()

beforeEach(() => {
  window.localStorage.clear()
  for (const name of documentRoot().getAttributeNames()) {
    if (name.startsWith('data-')) documentRoot().removeAttribute(name)
  }
})

afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount()
})

describe('a Reading Aid setting', () => {
  test('reads what the script in the head set, and keeps a change for the next page', () => {
    window.localStorage.setItem(readingAidStorageKey('romaji'), 'true')
    runTheHeadScript()
    const button = romajiSwitch()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    act(() => button.click())
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(documentRoot().getAttribute('data-romaji')).toBe('off')
    expect(window.localStorage.getItem(readingAidStorageKey('romaji'))).toBe('false')
  })

  test('is the app’s default before anything is kept', () => {
    const button = romajiSwitch()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    act(() => button.click())
    expect(documentRoot().getAttribute('data-romaji')).toBe('on')
  })

  test('follows a change made in another tab, whether or not its switch is shown', () => {
    runTheHeadScript()
    const changedElsewhere = (newValue: string) =>
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: readingAidStorageKey('romaji'), newValue })
        )
      })
    changedElsewhere('true')
    expect(documentRoot().getAttribute('data-romaji')).toBe('on')
    const button = romajiSwitch()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    changedElsewhere('false')
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })
})
