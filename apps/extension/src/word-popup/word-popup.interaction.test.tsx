import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { PronounceWithoutLocalVoice } from '@zenbu/ui/dictionary/pronounce-button'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingDefaults } from '../shared/settings'
import { wordAddress } from '../shared/word-address'
import { byText, click, find, openMenu, type Rendered, render, settle } from '../test/render'
import { openFullEntryButton, popupAnswer, youkyuu } from '../test/word-cards'
import { wordDetailLabels } from '../word-detail/labels'
import type { Sharing } from './copy'
import { wordPopupLabels as labels } from './labels'
import type { WordLookUp } from './use-cards'
import { WordPopup } from './word-popup'

vi.mock('../shared/dictionary', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared/dictionary')>()),
  lookUpWord: vi.fn(async (entSeq: number) => ({
    type: 'word',
    rows: fixtureWordRows.find(rows => rows.entry.entSeq === entSeq) ?? null
  }))
}))

vi.mock('../shared/dictionary-progress', async () => {
  const { fakeDictionaryProgress } = await import('../test/data-state')
  return fakeDictionaryProgress
})

const address = wordAddress(youkyuu)

let shown: Rendered | undefined

const shareButton = (popup: HTMLElement) =>
  find(popup, `button[aria-label="${fill(labels.share.share, { name: '要求' })}"]`)

const buttonNames = (popup: HTMLElement) =>
  [...popup.querySelectorAll('button')].map(
    button => button.getAttribute('aria-label') ?? button.textContent?.trim()
  )

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  shown?.unmount()
  shown = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function showPopup(
  text: string,
  ids: string[],
  { lookUp = async id => popupAnswer(id), sharing }: { lookUp?: WordLookUp; sharing?: Sharing } = {}
) {
  shown = render(
    <PronounceWithoutLocalVoice value="unsupported">
      <WordPopup
        text={text}
        ids={ids}
        lookUp={lookUp}
        settings={settingDefaults}
        sharing={sharing}
      />
    </PronounceWithoutLocalVoice>
  )
  await settle()
  const popup = find(shown.container, '[data-word-popup]')
  return { popup }
}

const currentPopup = () => find(shown?.container ?? document, '[data-word-popup]')

const shownEntry = () =>
  find(currentPopup(), 'section[data-entry-page]:not([hidden])') as HTMLElement

describe('the word popup', () => {
  it('shows the word’s card, takes focus, and has an Open Full Entry icon', async () => {
    const { popup } = await showPopup('要求', ['youkyuu'])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.word, { name: '要求' }))
    expect(document.activeElement).toBe(popup)
    expect(find(popup, '[data-meaning]').textContent).toContain('demand')
    expect(buttonNames(popup)).toEqual([
      fill(labels.share.share, { name: '要求' }),
      fill(labels.share.moreActions, { name: '要求' }),
      labels.openFullEntry,
      pronounceLabel('ようきゅう')
    ])
    const icon = openFullEntryButton(popup)
    expect(icon.getAttribute('title')).toBe(labels.openFullEntry)
    expect(icon.textContent).toBe('')
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  it('expands in place into the word’s full entry, which scrolls inside the card, and Back folds it again', async () => {
    const { popup } = await showPopup('要求', ['youkyuu'])
    await click(openFullEntryButton(popup))
    const expanded = currentPopup()
    expect(expanded.hasAttribute('data-expanded')).toBe(true)
    expect(expanded.className).toContain('overflow-hidden')
    expect(expanded.className).toContain('max-w-')
    const entry = shownEntry()
    expect(entry.dataset.entryPage).toBe('word')
    expect(find(entry, '.overflow-y-auto').contains(find(entry, 'h1'))).toBe(true)
    expect(find(entry, 'h1').getAttribute('aria-label')).toBe('要求')
    expect(find(entry, 'h1 [class*="text-"]').className).toContain('text-4xl')
    expect(document.activeElement?.textContent).toBe(labels.back)

    await click(byText(entry, 'button', labels.back))
    expect(currentPopup().hasAttribute('data-expanded')).toBe(false)
    expect(document.activeElement).toBe(currentPopup())
    expect(find(currentPopup(), '[data-meaning]').textContent).toContain('demand')
  })

  it('shows Word Detail’s own header actions in the expanded card, Open on zenbujapanese.com among them', async () => {
    const { popup } = await showPopup('要求', ['youkyuu'])
    await click(openFullEntryButton(popup))
    const label = wordDetailLabels.share.openOnWebsite
    const link = find(shownEntry(), `a[aria-label="${label}"]`) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(address)
    expect(link.target).toBe('_blank')
    expect(
      link.nextElementSibling?.querySelector(
        `button[aria-label="${fill(labels.share.share, { name: '要求' })}"]`
      )
    ).not.toBeNull()
  })

  it('asks which word is meant when the text has several, and offers them all in the full entry', async () => {
    const { popup } = await showPopup('要', ['kaname', 'you'])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.choose, { name: '要' }))
    const choices = [...popup.querySelectorAll('[data-choice]')]
    expect(choices.map(choice => choice.getAttribute('data-choice'))).toEqual([
      '1609600',
      '2188720'
    ])
    expect(choices[0].textContent).toContain('要【かなめ】')
    expect(popup.querySelector('[data-headword]')).toBeNull()

    await click(choices[1])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.word, { name: '要' }))
    await click(openFullEntryButton(popup))
    const tabs = [...shownEntry().querySelectorAll('[role="tab"]')]
    expect(tabs.map(tab => tab.textContent)).toEqual(['かなめ', 'よう'])
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    await click(byText(shownEntry(), 'button', labels.back))
    expect(currentPopup().getAttribute('aria-label')).toBe(fill(labels.word, { name: '要' }))
    await click(byText(currentPopup(), 'button', labels.back))
    expect(currentPopup().querySelectorAll('[data-choice]')).toHaveLength(2)
  })

  it('says when the word isn’t in the dictionary, and when the dictionary didn’t answer', async () => {
    const missing = await showPopup('要', ['missing'])
    expect(missing.popup.textContent).toContain(labels.notFound)
    expect(missing.popup.querySelector(`[aria-label="${labels.openFullEntry}"]`)).toBeNull()
    shown?.unmount()

    const failing = await showPopup('要', ['youkyuu'], {
      lookUp: async () => ({ type: 'failed', reason: 'broken' })
    })
    expect(failing.popup.textContent).toContain(labels.failed)
    shown?.unmount()

    const rejecting = await showPopup('要', ['youkyuu'], {
      lookUp: () => Promise.reject(new Error('gone'))
    })
    expect(rejecting.popup.textContent).toContain(labels.failed)
  })

  it('shares the word with the share sheet where there is one', async () => {
    const share = vi.fn(async (_data: ShareData) => {})
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { share } })
    await click(shareButton(popup))
    expect(share).toHaveBeenCalledWith({
      title: '要求',
      text: '要求【ようきゅう】\n1. demand, request\n2. requirement',
      url: address
    })
    expect(popup.querySelector('[data-notice]')).toBeNull()
  })

  it('copies the word’s address and says so when the share sheet refuses, but not when it’s dismissed', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    const refused = new DOMException('Not allowed here.', 'NotAllowedError')
    const share = vi.fn(async (_data: ShareData) => Promise.reject(refused))
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { share, writeText } })
    await click(shareButton(popup))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(address)
    expect(find(popup, '[data-notice]').textContent).toBe(labels.share.linkCopied)
    shown?.unmount()

    const dismissed = new DOMException('Share canceled.', 'AbortError')
    const closed = await showPopup('要求', ['youkyuu'], {
      sharing: { share: async () => Promise.reject(dismissed), writeText }
    })
    await click(shareButton(closed.popup))
    expect(writeText).toHaveBeenCalledOnce()
    expect(closed.popup.querySelector('[data-notice]')).toBeNull()
  })

  it('copies the word’s address where there is no share sheet, and from Copy Link', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { writeText } })
    await click(shareButton(popup))
    expect(writeText).toHaveBeenLastCalledWith(address)
    expect(find(popup, '[data-notice]').textContent).toBe(labels.share.linkCopied)

    const menu = await openMenu(popup)
    await click(byText(menu, '[role="menuitem"]', labels.share.copyLink))
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('says the copy failed when nothing can copy', async () => {
    const writeText = vi.fn(async (_text: string) => Promise.reject(new Error('Denied.')))
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { writeText } })
    await click(shareButton(popup))
    expect(find(popup, '[data-notice]').textContent).toBe(labels.copyFailed)
  })

  it('says it can’t pronounce Japanese while the browser lists no voices, and speaks once a voice on this computer is listed', async () => {
    const kyoko = { name: 'Kyoko', voiceURI: 'Kyoko', lang: 'ja-JP', localService: true }
    let voices: (typeof kyoko)[] = []
    const speech = Object.assign(new EventTarget(), {
      getVoices: () => voices,
      cancel: vi.fn(),
      speak: vi.fn<(utterance: { text: string; voice: unknown }) => void>()
    })
    vi.stubGlobal('speechSynthesis', speech)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(readonly text: string) {}
      }
    )
    const { popup } = await showPopup('要求', ['youkyuu'])
    const speaker = find(popup, 'button[aria-label="Pronounce ようきゅう"]')
    vi.useFakeTimers()
    act(() => speaker.click())
    act(() => vi.advanceTimersByTime(1000))
    expect(speech.speak).not.toHaveBeenCalled()
    expect(find(popup, '[data-notice]').textContent).toBe(labels.pronounce.unsupported)

    voices = [kyoko]
    act(() => speech.dispatchEvent(new Event('voiceschanged')))
    expect(popup.querySelector('[data-notice]')).toBeNull()
    act(() => speaker.click())
    expect(speech.speak).toHaveBeenCalledOnce()
    expect(speech.speak.mock.calls[0]?.[0]).toMatchObject({ text: 'ようきゅう', voice: kyoko })
  })
})
