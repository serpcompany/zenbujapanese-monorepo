import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { furiganaTool } from '@/lib/tools/furigana-tool'
import { click, fill, render, settle, unmount } from '@/test/account-page'
import { FuriganaConverter } from './furigana-converter'

afterEach(unmount)

const readAfterThePause = { timeout: 5_000 }

const otona = [{ text: '大人', reading: 'おとな' }]

function converter(locale: Locale = 'en') {
  const t = getDictionary(locale).tools
  return render(
    <FuriganaConverter
      sample={furiganaTool.sample}
      tries={furiganaTool.tries}
      limit={200}
      text={t.furigana}
      words={t.converter}
      locale={locale}
    />
  )
}

function routeAnswering(...answers: Response[]) {
  const asked: string[] = []
  const fetch = vi.fn(async (url: string) => {
    asked.push(url)
    return answers.shift() ?? Response.json({ furigana: otona })
  })
  vi.stubGlobal('fetch', fetch)
  return asked
}

const furiganaShown = (container: HTMLElement) =>
  [...container.querySelectorAll('output ruby')].map(ruby => ruby.textContent)

const box = (container: HTMLElement) => {
  const field = container.querySelector('textarea')
  if (!field) throw new Error('No box')
  return field
}

async function seesFurigana(container: HTMLElement, furigana: string[]) {
  await vi.waitFor(async () => {
    await settle()
    expect(furiganaShown(container)).toEqual(furigana)
  }, readAfterThePause)
}

describe('the furigana converter', () => {
  test('starts with its sample and the sample’s furigana, without asking for them', () => {
    const asked = routeAnswering()
    const container = converter()
    expect(box(container).value).toBe(furiganaTool.sample.text)
    expect(furiganaShown(container)).toContain('今日きょう')
    expect(container.textContent).toContain('27 of 200 characters')
    expect(asked).toEqual([])
  })

  test('reads what is typed once typing pauses, and shows its furigana', async () => {
    const asked = routeAnswering()
    const container = converter()
    await fill(container, 'Japanese', '大人')
    await seesFurigana(container, ['大人おとな'])
    expect(asked).toEqual([`/tools/furigana.json?text=${encodeURIComponent('大人')}`])
  })

  test('says a text over the limit is too long, marks the box, and asks nothing', async () => {
    const asked = routeAnswering()
    const container = converter()
    await fill(container, 'Japanese', 'あ'.repeat(201))
    await settle()
    expect(container.textContent).toContain('That’s more than 200 characters')
    expect(box(container).getAttribute('aria-invalid')).toBe('true')
    expect(furiganaShown(container)).toEqual([])
    expect(asked).toEqual([])
  })

  test('says when the dictionary doesn’t answer, keeps the text, and Try again reads it', async () => {
    routeAnswering(Response.json({ error: 'unavailable' }, { status: 502 }))
    const container = converter()
    await fill(container, 'Japanese', '大人')
    await vi.waitFor(async () => {
      await settle()
      expect(container.textContent).toContain('The dictionary didn’t answer')
    }, readAfterThePause)
    expect(box(container).value).toBe('大人')
    await click(container, 'Try again')
    await seesFurigana(container, ['大人おとな'])
  })

  test('a Try example fills the box and reads it, and Clear empties both', async () => {
    routeAnswering()
    const container = converter()
    await click(container, '大人')
    expect(box(container).value).toBe('大人')
    await seesFurigana(container, ['大人おとな'])
    await click(container, 'Clear')
    expect(box(container).value).toBe('')
    expect(container.textContent).toContain('The text shows here with its furigana')
  })

  test('Copy puts the furigana on the clipboard as ruby, and as plain text with the readings in brackets', async () => {
    const written: Record<string, Blob>[] = []
    class Item {
      constructor(readonly items: Record<string, Blob>) {
        written.push(items)
      }
    }
    vi.stubGlobal('ClipboardItem', Item)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { write: vi.fn(async () => {}) } })
    const container = converter()
    await click(container, 'Copy With furigana')
    expect(await written[0]['text/plain'].text()).toBe(
      '今日（きょう）は大人（おとな）一人（ひとり）と子供（こども）二人（ふたり）で、日本（にほん）の映画（えいが）を見（み）に行（い）きます。'
    )
    expect(await written[0]['text/html'].text()).toContain(
      '<ruby>今日<rp>（</rp><rt>きょう</rt><rp>）</rp></ruby>は'
    )
    expect(container.textContent).toContain('Copied')
  })

  test('copies plain text where the browser can’t copy ruby', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('ClipboardItem', undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = converter()
    await click(container, 'Copy With furigana')
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^今日（きょう）は/))
  })

  test('on a Japanese page, its box, count, and messages are in Japanese', async () => {
    const t = getDictionary('ja').tools.furigana
    routeAnswering()
    const container = converter('ja')
    expect(container.textContent).toContain('27／200文字')
    await fill(container, t.input, 'あ'.repeat(201))
    await settle()
    expect(container.textContent).toContain(t.tooLong.replace('{limit}', '200'))
  })
})
