import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CountedWordsAnswer } from '../shared/dictionary'
import { writeSettings } from '../shared/settings'
import { settle } from '../test/render'
import { watching } from '../test/video-tab-harness'
import { popupAnswer } from '../test/word-cards'

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const word = (text: string) =>
  document.querySelector<HTMLElement>(`[data-line] [data-source] [data-word="${text}"]`)

const shareLine = () => document.querySelector('[data-known-share]')

const meaningsIn = (row: Element | undefined) =>
  [...(row?.querySelectorAll('[data-aid="meaning"] [aria-hidden="true"]') ?? [])].map(
    found => found.textContent
  )

describe('the transcript’s known words', () => {
  it('gives a known word no underline and no meaning, and no furigana with Hide Furigana on Known Words', async () => {
    tab = watching()
    await act(() =>
      writeSettings({
        'readingAids.wordMeanings': true,
        'readingAids.furiganaHiddenOnKnownWords': true
      })
    )
    tab.services.knownWords.mockImplementation(async () => ({ sanpo: true }))
    tab.services.popupCard.mockImplementation(async () => popupAnswer('youkyuu'))
    const shown = tab
    await shown.show(true)
    await shown.lines()
    const row = () => shown.row('散歩に行きましょう')
    await vi.waitFor(() => expect(word('散歩')?.hasAttribute('data-known')).toBe(true))
    await vi.waitFor(() => expect(meaningsIn(row())).toEqual(['demand']))
    expect(word('散歩')?.querySelector('rt')).toBeNull()
    expect(word('行きましょう')?.querySelector('rt')?.textContent).toBe('い')
    expect(shown.services.knownWords).toHaveBeenCalledWith(expect.arrayContaining(['sanpo', 'iku']))
    await shown.knows({ sanpo: false })
    expect(word('散歩')?.hasAttribute('data-known')).toBe(false)
    expect(word('散歩')?.querySelector('rt')?.textContent).toBe('さんぽ')
    expect(meaningsIn(row())).toEqual(['demand', 'demand'])
  })

  it('asks again for the known words a failed request missed, once the known words next change', async () => {
    tab = watching()
    tab.services.knownWords.mockRejectedValueOnce(new Error('No answer'))
    tab.services.knownWords.mockImplementation(async () => ({ sanpo: true }))
    const shown = tab
    await shown.show(true)
    await shown.lines()
    await vi.waitFor(() => expect(shown.services.knownWords).toHaveBeenCalledOnce())
    await settle()
    expect(word('散歩')?.hasAttribute('data-known')).toBe(false)
    await shown.knows({ taberu: true })
    await vi.waitFor(() => expect(word('散歩')?.hasAttribute('data-known')).toBe(true))
  })
})

describe('the share of the video’s words known', () => {
  it('reads Counting known words by the title, then the share, which rises when a word is marked Known', async () => {
    tab = watching({ saving: null })
    const shown = tab
    let count: (answer: CountedWordsAnswer) => void = () => {}
    shown.services.countWords.mockImplementationOnce(() => new Promise(done => (count = done)))
    await shown.show(true)
    await shown.lines()
    expect(document.querySelector('[data-video-title]')?.nextElementSibling).toBe(shareLine())
    expect(shareLine()?.textContent).toBe('Counting known words…')
    expect(shown.services.countWords).toHaveBeenCalledWith(
      expect.arrayContaining(['散歩に行きましょう'])
    )
    await act(async () => count({ type: 'counted-words', ids: ['sanpo', 'iku', 'kyou', 'tenki'] }))
    await vi.waitFor(() => expect(shareLine()?.textContent).toBe('0% 0 of 4 words known'))
    expect(shareLine()?.querySelector('.text-red-600')?.textContent).toBe('0%')
    await shown.knows({ sanpo: true })
    expect(shareLine()?.textContent).toBe('25% 1 of 4 words known')
    expect(shareLine()?.querySelector('.text-orange-700')?.textContent).toBe('25%')
    expect(word('散歩')?.hasAttribute('data-known')).toBe(true)
    await shown.knows({ iku: true, kyou: true })
    expect(shareLine()?.querySelector('.text-green-700')?.textContent).toBe('75%')
    expect(shown.services.countWords).toHaveBeenCalledOnce()
  })

  it('shows nothing signed out, and the share once signed in with saving allowed', async () => {
    tab = watching()
    const shown = tab
    await shown.show(true)
    await shown.lines()
    expect(shareLine()).toBeNull()
    expect(shown.services.countWords).not.toHaveBeenCalled()
    await shown.refuse(null)
    await vi.waitFor(() => expect(shareLine()?.textContent).toBe('0% 0 of 4 words known'))
    await shown.refuse('subscription-required')
    expect(shareLine()).toBeNull()
  })
})
