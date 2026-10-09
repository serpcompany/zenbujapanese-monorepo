import { act } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ConverterSlug } from '@/lib/tools/paths'
import { click, fill, render, settle, unmount } from '@/test/account-page'
import { Converter } from './converter'

afterEach(unmount)

const converter = (slug: ConverterSlug) => render(<Converter slug={slug} />)

function box(container: HTMLElement, label: string) {
  const labelled = [...container.querySelectorAll('label')].find(
    candidate => candidate.textContent === label
  )
  const field = labelled
    ? container.querySelector<HTMLTextAreaElement>(`[id="${labelled.htmlFor}"]`)
    : null
  if (!field) throw new Error(`No box labelled ${label}`)
  return field
}

describe('a converter', () => {
  test('starts with its sample, and converts what is typed in the top box into the bottom one', async () => {
    const container = converter('hiragana-to-katakana')
    expect(box(container, 'Katakana').value).toBe(
      'コンピューター、スマートフォン、コーヒー、アイスクリーム'
    )
    await fill(container, 'Hiragana', 'すし')
    expect(box(container, 'Katakana').value).toBe('スシ')
    expect(container.textContent).toContain('2 characters')
  })

  test('converts what is typed in the bottom box into the top one, keeping the bottom as typed', async () => {
    const container = converter('romaji-to-kana')
    await fill(container, 'Kana', 'コーヒー')
    expect(box(container, 'Romaji').value).toBe('koohii')
    expect(box(container, 'Kana').value).toBe('コーヒー')
  })

  test('Clear empties both boxes', async () => {
    const container = converter('katakana-to-hiragana')
    await click(container, 'Clear')
    expect(box(container, 'Katakana').value).toBe('')
    expect(box(container, 'Hiragana').value).toBe('')
    expect(container.textContent).toContain('0 characters')
  })

  test('a Try example fills the top box', async () => {
    const container = converter('romaji-to-kana')
    await click(container, 'ko-hi-')
    expect(box(container, 'Romaji').value).toBe('ko-hi-')
    expect(box(container, 'Kana').value).toBe('こーひー')
  })

  test('romaji to kana writes katakana once Katakana is chosen', async () => {
    const container = converter('romaji-to-kana')
    await fill(container, 'Romaji', 'ko-hi-')
    await click(container, 'Katakana')
    expect(box(container, 'Kana').value).toBe('コーヒー')
  })

  test('a width option left off keeps that kind of character as it is, both ways', async () => {
    const container = converter('half-width-to-full-width')
    await fill(container, 'Half-width', 'ｶﾀｶﾅ ABC')
    expect(box(container, 'Full-width').value).toBe('カタカナ　ＡＢＣ')
    const label = [...container.querySelectorAll('label')].find(
      candidate => candidate.textContent === 'Letters and numbers'
    )
    const letters = label ? container.querySelector(`[aria-labelledby="${label.id}"]`) : null
    await act(async () => label?.click())
    await settle()
    expect(letters?.getAttribute('aria-checked')).toBe('false')
    expect(box(container, 'Full-width').value).toBe('カタカナ　ABC')
    await fill(container, 'Full-width', 'ガッコウ　ＡＢＣ')
    expect(box(container, 'Half-width').value).toBe('ｶﾞｯｺｳ ＡＢＣ')
  })

  test('each box’s Copy puts its own text on the clipboard and says so', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = converter('kana-to-romaji')
    await fill(container, 'Kana', 'きって')
    await click(container, 'Copy Romaji')
    expect(writeText).toHaveBeenLastCalledWith('kitte')
    await click(container, 'Copy Kana')
    expect(writeText).toHaveBeenLastCalledWith('きって')
    expect(container.textContent).toContain('Copied')
  })

  test('says how to copy by hand when the browser won’t', async () => {
    const writeText = vi.fn(async (_text: string) => {
      throw new Error('denied')
    })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = converter('kana-to-romaji')
    await click(container, 'Copy Romaji')
    expect(container.textContent).toContain('Select the text to copy it')
  })
})
