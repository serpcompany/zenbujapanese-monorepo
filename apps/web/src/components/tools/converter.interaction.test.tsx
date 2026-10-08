import { act } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ConverterSlug } from '@/lib/tools/paths'
import { click, fill, render, settle, unmount } from '@/test/account-page'
import { Converter } from './converter'
import { ConverterTextsProvider } from './converter-texts'

afterEach(unmount)

function converter(slug: ConverterSlug) {
  return render(
    <ConverterTextsProvider>
      <Converter slug={slug} />
    </ConverterTextsProvider>
  )
}

const output = (container: HTMLElement) =>
  container.querySelector('output[aria-labelledby]')?.textContent

const field = (container: HTMLElement) => container.querySelector('textarea')

describe('a converter', () => {
  test('starts with its sample, and converts what is typed as it is typed', async () => {
    const container = converter('hiragana-to-katakana')
    expect(output(container)).toBe('コンピューター、スマートフォン、コーヒー、アイスクリーム')
    await fill(container, 'Hiragana', 'すし')
    expect(output(container)).toBe('スシ')
    expect(container.textContent).toContain('2 characters')
  })

  test('Clear empties the input and says where the result will show', async () => {
    const container = converter('katakana-to-hiragana')
    await click(container, 'Clear')
    expect(field(container)?.value).toBe('')
    expect(output(container)).toBe('The result shows here.')
    expect(container.textContent).toContain('0 characters')
  })

  test('a Try example becomes the input', async () => {
    const container = converter('romaji-to-kana')
    await click(container, 'ko-hi-')
    expect(field(container)?.value).toBe('ko-hi-')
    expect(output(container)).toBe('こーひー')
  })

  test('romaji to kana writes katakana once Katakana is chosen', async () => {
    const container = converter('romaji-to-kana')
    await fill(container, 'Romaji', 'ko-hi-')
    await click(container, 'Katakana')
    expect(output(container)).toBe('コーヒー')
  })

  test('a width option left off keeps that kind of character as it is', async () => {
    const container = converter('half-width-to-full-width')
    await fill(container, 'Half-width', 'ｶﾀｶﾅ ABC')
    expect(output(container)).toBe('カタカナ　ＡＢＣ')
    const label = [...container.querySelectorAll('label')].find(
      candidate => candidate.textContent === 'Letters and numbers'
    )
    const letters = label?.querySelector('[role="checkbox"]')
    expect(letters?.getAttribute('aria-checked')).toBe('true')
    await act(async () => label?.click())
    await settle()
    expect(letters?.getAttribute('aria-checked')).toBe('false')
    expect(output(container)).toBe('カタカナ　ABC')
  })

  test('Copy puts the result on the clipboard and says so', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = converter('kana-to-romaji')
    await fill(container, 'Kana', 'きって')
    await click(container, 'Copy')
    expect(writeText).toHaveBeenCalledWith('kitte')
    expect(container.textContent).toContain('Copied')
  })

  test('says how to copy by hand when the browser won’t', async () => {
    const writeText = vi.fn(async (_text: string) => {
      throw new Error('denied')
    })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = converter('kana-to-romaji')
    await click(container, 'Copy')
    expect(container.textContent).toContain('Select the text to copy it')
  })
})
